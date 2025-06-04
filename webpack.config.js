const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const fs = require('fs');

//* Ensure tmp directory exists
const tmpDir = path.resolve(__dirname, 'tmp/webpack');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

//* Track last build time to prevent rapid recompilation
let lastBuildTime = 0;
const BUILD_COOLDOWN = 1000; //* 1 second cooldown between builds

//* Helper function to safely copy files
function safeCopyFile(src, dest) {
  try {
    //* Only copy if source exists and is newer than destination
    if (fs.existsSync(src)) {
      const srcStats = fs.statSync(src);
      const destStats = fs.existsSync(dest) ? fs.statSync(dest) : null;
      
      if (!destStats || srcStats.mtimeMs > destStats.mtimeMs) {
        fs.copyFileSync(src, dest);
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error(`Error copying file from ${src} to ${dest}:`, error);
    return false;
  }
}

module.exports = [
  {
    entry: {
      'tailwind-output': './static/css/src/tailwind.css',
      parallax: './static/js/react-components/ParallaxApp.jsx',
      date: './static/js/react-components/DateApp.jsx'
    },
    output: {
      filename: '[name]-bundle.js',
      path: path.resolve(__dirname, 'tmp/webpack/js'),
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
        },
        {
          test: /\.css$/,
          use: [
            MiniCssExtractPlugin.loader,
            'css-loader',
            'postcss-loader'
          ]
        }
      ]
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '../css/[name].css'
      }),
      {
        apply: (compiler) => {
          compiler.hooks.afterEmit.tap('CopyFilesPlugin', (compilation) => {
            const now = Date.now();
            if (now - lastBuildTime < BUILD_COOLDOWN) {
              return; //* Skip if we're within the cooldown period
            }
            lastBuildTime = now;

            let filesChanged = false;

            //* Copy JS files
            const jsFiles = fs.readdirSync(path.resolve(__dirname, 'tmp/webpack/js'));
            jsFiles.forEach(file => {
              //* Skip any files that aren't part of our current entry points
              if (!file.includes('tailwind-output') && !file.includes('parallax') && !file.includes('date')) {
                return;
              }
              
              const changed = safeCopyFile(
                path.resolve(__dirname, 'tmp/webpack/js', file),
                path.resolve(__dirname, 'static/js', file)
              );
              filesChanged = filesChanged || changed;
            });

            //* Copy CSS files
            const cssFiles = fs.readdirSync(path.resolve(__dirname, 'tmp/webpack/css'));
            cssFiles.forEach(file => {
              //* Skip any files that aren't part of our current entry points
              if (!file.includes('tailwind-output') && !file.includes('parallax') && !file.includes('date')) {
                return;
              }
              
              const changed = safeCopyFile(
                path.resolve(__dirname, 'tmp/webpack/css', file),
                path.resolve(__dirname, 'static/css', file)
              );
              filesChanged = filesChanged || changed;
            });

            if (filesChanged) {
              console.log('Files updated successfully');
            }
          });
        }
      }
    ],
    resolve: {
      extensions: ['.js', '.jsx']
    },
    
    devtool: process.env.NODE_ENV === 'production' ? false : 'eval-source-map',
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development'
  }
]; 