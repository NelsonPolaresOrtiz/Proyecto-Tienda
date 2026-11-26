require('dotenv').config();

module.exports = {
  secret: process.env.JWT_SECRET || 'candy_boom_super_secret_jwt_key_2026_bolivia_pos',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  cookieName: 'candy_boom_token',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
};
