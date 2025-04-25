const path = require('path');

module.exports = [
  {
    entry: './static/js/react-components/ParallaxApp.jsx',
    output: {
      filename: 'parallax-bundle.js',
      path: path.resolve(__dirname, 'static/js'),
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.jsx']
    },
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
  },
  {
    entry: './static/js/react-components/DateApp.jsx',
    output: {
      filename: 'date-bundle.js',
      path: path.resolve(__dirname, 'static/js'),
    },
    module: {
      rules: [
        {
          test: /\.(js|jsx)$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env', '@babel/preset-react']
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.js', '.jsx']
    },
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
  }
]; 