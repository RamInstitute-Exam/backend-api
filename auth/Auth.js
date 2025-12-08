import jwt from "jsonwebtoken";

const Authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.token;
    console.log("Token from cookie:", token);

    if (!token) {
      return res.status(401).json({ message: "No token provided. Authorization denied." });
    }

    const decoded = jwt.verify(token, process.env.Secret_key);
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Token verification failed:", error.message);
    return res.status(401).json({ message: "Invalid or expired token. Authorization denied." });
  }
};

export default Authenticate;
