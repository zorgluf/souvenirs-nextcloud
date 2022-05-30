const path = require('path')
const { VueLoaderPlugin } = require('vue-loader');

module.exports = {
	entry: {
		'index': './src/index.js',
		'index-list': './src/index-list.js'
	},
	output: {
		path: path.resolve(__dirname, './js'),
		publicPath: '/js',
		filename: 'vue-[name].js'
	},
	optimization: {
		splitChunks: {
			automaticNameDelimiter: '-',
		}
	},
	module: {
		rules: [
			{
				test: /\.css$/,
				use: [
					'vue-style-loader', 'css-loader'
				],
			},
			{
				test: /\.scss$/,
				use: [
					'vue-style-loader', 'css-loader', 'sass-loader'
				],
			},
			{
				test: /\.vue$/,
				loader: 'vue-loader',
				//options: {
				//	hotReload: false // disables Hot Reload
				//}
			},
			{
				test: /\.js$/,
				loader: 'babel-loader',
				exclude: /node_modules/
			},
			{
				test: /\.gif$/,
				loader: 'url-loader'
			},
			{
				test: /\.svg$/,
				type: "asset/inline"
			}
		]
	},
	plugins: [
		new VueLoaderPlugin()
	],
	resolve: {
		extensions: [ '.js', '.vue', '.json']
	}
}