import { getPool } from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { toId } from "../utils/mysqlMappers.js";

// POST - Inicio de sesión
export const login = async (req, res) => {
    try {
        const pool = getPool();
        const { email, password } = req.body;
        const emailNormalizado = typeof email === "string" ? email.trim().toLowerCase() : "";

        // Validar que haya email y password
        if (!emailNormalizado || typeof password !== "string" || !password) {
            return res.status(400).json({ mensaje: "Debe ingresar email y contraseña." });
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalizado)) {
            return res.status(400).json({ mensaje: "El correo electrónico debe tener un formato válido." });
        }

        // Buscar usuario existente
                const [rows] = await pool.query(
                    `SELECT id, nombresApellidos, email, rol, estadoUsuario, password
                     FROM usuarios
                     WHERE email = ?
                     LIMIT 1`,
                    [emailNormalizado]
                );

                const usuario = rows[0];

        if (!usuario) {
            return res.status(404).json({ mensaje: "El usuario no existe." });
        }

        // Comparar contraseñas
        const passwordValida = await bcrypt.compare(password, usuario.password);

        if (!passwordValida) {
            return res.status(401).json({ mensaje: "Contraseña incorrecta." });
        }

        // Generar token JWT
        const token = jwt.sign(
            { 
                id: toId(usuario.id), 
                rol: usuario.rol 
            },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // Respuesta de inicio de sesión exitoso
        return res.status(200).json({
            mensaje: "Inicio de sesión exitoso.",
            token,
            usuario: {
                _id: toId(usuario.id),
                id: toId(usuario.id),
                nombresApellidos: usuario.nombresApellidos,
                email: usuario.email,
                rol: usuario.rol,
                estado: usuario.estadoUsuario
            }
        });

    } catch (error) {
        console.error("Error al iniciar sesión:", error);
        return res.status(500).json({ mensaje: "Error del servidor." });
    }
};
