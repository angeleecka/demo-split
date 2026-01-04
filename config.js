// config.js
module.exports = {
  // внутренняя папка для хранения медиа
  mediaDir: process.env.MEDIA_DIR || 'uploads',

  // URL, по которому они будут доступны
  mediaUrl: process.env.MEDIA_URL || '/uploads'
};
