module.exports = {
  plugins: [
    require('autoprefixer')({ cascade: false }),
    require('css-declaration-sorter')({ order: 'smacss' }),
    require('postcss-sort-media-queries')({ sort: 'mobile-first' }),
  ],
};
