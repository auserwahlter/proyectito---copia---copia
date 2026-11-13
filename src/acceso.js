const { leerUsuarioAutenticado } = require('./jwt');

async function requireAuth(req, res, next) {
  try {
    const usuario = await leerUsuarioAutenticado(req);
    if (!usuario) {
      return res.status(401).json({
        success: false,
        message: 'Debes iniciar sesión para realizar esta acción',
      });
    }
    req.usuario = usuario;
    next();
  } catch (error) {
    next(error);
  }
}

function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        success: false,
        message: 'No tienes permisos para esta acción',
      });
    }
    next();
  };
}

function esModerador(req, res, next) {
  return requireRol('moderador', 'admin')(req, res, next);
}

function esAdmin(req, res, next) {
  return requireRol('admin')(req, res, next);
}

module.exports = { requireAuth, requireRol, esModerador, esAdmin };