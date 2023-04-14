# This file is licensed under the Affero General Public License version 3 or
# later. See the COPYING file.
# @author Bernhard Posselt <dev@bernhard-posselt.com>
# @copyright Bernhard Posselt 2016

# Generic Makefile for building and packaging a Nextcloud app which uses npm and
# Composer.
#
# Dependencies:
# * make
# * which
# * curl: used if phpunit and composer are not installed to fetch them from the web
# * tar: for building the archive
# * npm: for building and testing everything JS
#
# If no composer.json is in the app root directory, the Composer step
# will be skipped. The same goes for the package.json which can be located in
# the app root or the js/ directory.
#
# The npm command by launches the npm build script:
#
#    npm run build
#
# The npm test command launches the npm test script:
#
#    npm run test
#
# The idea behind this is to be completely testing and build tool agnostic. All
# build tools and additional package managers should be installed locally in
# your project, since this won't pollute people's global namespace.
#
# The following npm scripts in your package.json install and update the bower
# and npm dependencies and use gulp as build system (notice how everything is
# run from the node_modules folder):
#
#    "scripts": {
#        "test": "node node_modules/gulp-cli/bin/gulp.js karma",
#        "prebuild": "npm install && node_modules/bower/bin/bower install && node_modules/bower/bin/bower update",
#        "build": "node node_modules/gulp-cli/bin/gulp.js"
#    },

app_name=souvenirs
build_tools_directory=$(CURDIR)/build/tools
source_build_directory=$(CURDIR)/build/artifacts/source
source_package_name=$(source_build_directory)/$(app_name)
appstore_build_directory=$(CURDIR)/build/artifacts/appstore
appstore_package_name=$(appstore_build_directory)/$(app_name)
npm=$(shell which npm 2> /dev/null)
composer=$(shell which composer 2> /dev/null)

all: build

# Fetches the PHP and JS dependencies and compiles the JS. If no composer.json
# is present, the composer step is skipped, if no package.json or js/package.json
# is present, the npm step is skipped
.PHONY: build
build:
ifneq (,$(wildcard $(CURDIR)/composer.json))
	make composer
endif
ifneq (,$(wildcard $(CURDIR)/package.json))
	make npm
endif
ifneq (,$(wildcard $(CURDIR)/vite-src/package.json))
	make npm
endif

# Installs and updates the composer dependencies. If composer is not installed
# a copy is fetched from the web
.PHONY: composer
composer:
ifeq (, $(composer))
	@echo "No composer command available, downloading a copy from the web"
	mkdir -p $(build_tools_directory)
	curl -sS https://getcomposer.org/installer | php
	mv composer.phar $(build_tools_directory)
	php $(build_tools_directory)/composer.phar install --prefer-dist
	php $(build_tools_directory)/composer.phar update --prefer-dist
else
	composer install --prefer-dist
	composer update --prefer-dist
endif

# Installs npm dependencies
.PHONY: npm
npm:
	cd vite-src && npm install
	cd vite-src && npm run build

# Removes the appstore build
.PHONY: clean
clean:
	rm -rf ./build

# Same as clean but also removes dependencies installed by composer, bower and
# npm
.PHONY: distclean
distclean: clean
	rm -rf vendor
	rm -rf node_modules
	rm -rf js/vendor
	rm -rf js/node_modules
	rm -rf vite-src/dist
	rm -rf vite-src/node_modules
	rm -rf js/vite

# Builds the source and appstore package
.PHONY: dist
dist:
	make source
	make appstore

# Builds the source package
.PHONY: source
source:
	rm -rf $(source_build_directory)
	mkdir -p $(source_build_directory)
	tar  \
	--exclude-vcs \
	--exclude="$(CURDIR)/build" \
	--exclude="$(CURDIR)/js/node_modules" \
	--exclude="$(CURDIR)/js/vite" \
	--exclude="$(CURDIR)/vite-src/node_modules" \
	--exclude="$(CURDIR)/vite-src/dist" \
	--exclude="$(CURDIR)/node_modules" \
	--exclude="$(CURDIR)/*.log" \
	--exclude="$(CURDIR)/js/*.log" \
	--exclude="$(CURDIR)/publish.*" \
	--exclude="$(CURDIR)/vendor" \
	--transform="flags=r;s|$(CURDIR:/%=%)|$(app_name)|" \
	-czf $(source_package_name).tar.gz $(CURDIR)

# Builds the source package for the app store, ignores php and js tests
.PHONY: appstore
appstore:
	rm -rf $(appstore_build_directory)
	mkdir -p $(appstore_build_directory)
	tar  \
	--exclude-vcs \
	--exclude="$(CURDIR)/build" \
	--exclude="$(CURDIR)/tests" \
	--exclude="$(CURDIR)/Makefile" \
	--exclude="$(CURDIR)/*.log" \
	--exclude="$(CURDIR)/phpunit*xml" \
	--exclude="$(CURDIR)/composer.*" \
	--exclude="$(CURDIR)/js/node_modules" \
	--exclude="$(CURDIR)/js/tests" \
	--exclude="$(CURDIR)/js/test" \
	--exclude="$(CURDIR)/js/*.log" \
	--exclude="$(CURDIR)/js/package.json" \
	--exclude="$(CURDIR)/js/bower.json" \
	--exclude="$(CURDIR)/js/karma.*" \
	--exclude="$(CURDIR)/js/protractor.*" \
	--exclude="$(CURDIR)/package.json" \
	--exclude="$(CURDIR)/bower.json" \
	--exclude="$(CURDIR)/karma.*" \
	--exclude="$(CURDIR)/protractor\.*" \
	--exclude="$(CURDIR)/.*" \
	--exclude="$(CURDIR)/js/.*" \
	--exclude="$(CURDIR)/node_modules" \
	--exclude="$(CURDIR)/vendor" \
	--exclude="$(CURDIR)/README.md" \
	--exclude="$(CURDIR)/webpack*" \
	--exclude="$(CURDIR)/src" \
	--exclude="$(CURDIR)/vite-src" \
	--exclude="$(CURDIR)/publish.*" \
	--exclude="$(CURDIR)/Jenkinsfile" \
	--exclude="$(CURDIR)/package-lock.json" \
	--transform="flags=r;s|$(CURDIR:/%=%)|$(app_name)|" \
	-czf $(appstore_package_name).tar.gz $(CURDIR)

.PHONY: test
test: composer
	$(CURDIR)/vendor/phpunit/phpunit/phpunit -c phpunit.xml
	$(CURDIR)/vendor/phpunit/phpunit/phpunit -c phpunit.integration.xml
