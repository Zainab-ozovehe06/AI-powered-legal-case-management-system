const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.currentUser) {
      return res.status(401).json({ message: 'Unauthenticated' });
    }

    if (!allowedRoles.includes(req.currentUser.role)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    next();
  };
};

export default allowRoles;