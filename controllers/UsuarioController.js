import { getPool } from "../config/db.js";
import bcrypt from "bcryptjs";
import { toId } from "../utils/mysqlMappers.js";
import { getTodayDateOnly, isDateOnly } from "../utils/dateValidation.js";

const normalizeRole = (rol = "") => {
    return String(rol || "").trim().toLowerCase();
};

const isValidEmail = (email) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPassword = (password) =>
    typeof password === "string" &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[\W_]/.test(password);


//POST para registrar un nuevo usuario
export const registrarUsuario = async (req, res) => {
    try {
        const pool = getPool();

        const { 
            nombresApellidos, 
            documentoIdentidad,
            tipoDocumento,
            email, 
            password, 
            direccion, 
            telefono, 
            fechaNacimiento, 
            rol
         } = req.body;

        const nombreNormalizado = typeof nombresApellidos === "string" ? nombresApellidos.trim() : "";
        const documentoNormalizado = typeof documentoIdentidad === "string" ? documentoIdentidad.trim() : "";
        const tipoDocumentoNormalizado = typeof tipoDocumento === "string" ? tipoDocumento.trim().toUpperCase() : "";
        const emailNormalizado = typeof email === "string" ? email.trim().toLowerCase() : "";
        const direccionNormalizada = typeof direccion === "string" ? direccion.trim() : "";
        const telefonoNormalizado = typeof telefono === "string" ? telefono.trim() : "";
        const rolNormalizado = normalizeRole(rol);

        if (!["cliente", "especialista"].includes(rolNormalizado)) {
            return res.status(400).json({ mensaje: "Rol inválido." });
        }

        if (
            !nombreNormalizado ||
            !documentoNormalizado ||
            !tipoDocumentoNormalizado ||
            !emailNormalizado ||
            !password ||
            !direccionNormalizada ||
            !telefonoNormalizado ||
            !fechaNacimiento || 
            !rolNormalizado
        ) {   
            return res.status(400).json({ mensaje: "Complete todos los campos obligatorios." });
        }

        if (!/^[\p{L}\s'-]+$/u.test(nombreNormalizado)) {
            return res.status(400).json({ mensaje: "El nombre solo puede contener letras y espacios." });
        }
        if (!/^\d{5,}$/.test(documentoNormalizado)) {
            return res.status(400).json({ mensaje: "El documento debe ser numérico y tener al menos 5 dígitos." });
        }
        if (!["CC", "CE", "TI", "PP", "TE", "PEP"].includes(tipoDocumentoNormalizado)) {
            return res.status(400).json({ mensaje: "Tipo de documento inválido." });
        }
        if (!isValidEmail(emailNormalizado)) {
            return res.status(400).json({ mensaje: "El correo electrónico debe tener un formato válido." });
        }
        if (!/^\d{7,10}$/.test(telefonoNormalizado)) {
            return res.status(400).json({ mensaje: "El teléfono debe tener entre 7 y 10 dígitos." });
        }
        if (direccionNormalizada.length < 5) {
            return res.status(400).json({ mensaje: "La dirección debe tener al menos 5 caracteres." });
        }
        if (!isDateOnly(fechaNacimiento) || fechaNacimiento > getTodayDateOnly()) {
            return res.status(400).json({ mensaje: "La fecha de nacimiento debe ser válida y no puede estar en el futuro." });
        }
        if (!isValidPassword(password)) {
            return res.status(400).json({ mensaje: "La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo." });
        }

        //Verificar si el usuario ya existe
        const [existentes] = await pool.query(
            "SELECT id FROM usuarios WHERE email = ? OR documentoIdentidad = ? LIMIT 1",
            [emailNormalizado, documentoNormalizado]
        );
        if (existentes.length > 0) {
            return res.status(400).json({ mensaje: "El correo o documento ya está registrado." });
        }

    //Hashear la contraseña
    const passwordHash = await bcrypt.hash(password, 10);

        const [result] = await pool.query(
            `INSERT INTO usuarios (
                nombresApellidos, documentoIdentidad, tipoDocumento, email, password,
                direccion, telefono, fechaNacimiento, rol, estadoUsuario
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
            [
                nombreNormalizado,
                documentoNormalizado,
                tipoDocumentoNormalizado,
                emailNormalizado,
                passwordHash,
                direccionNormalizada,
                telefonoNormalizado,
                fechaNacimiento,
                rolNormalizado,
            ]
        );

    return res.status(201).json({ mensaje: 'Usuario registrado correctamente.',
        usuario: {
            _id: toId(result.insertId),
            id: toId(result.insertId),
            nombresApellidos: nombreNormalizado,
            email: emailNormalizado,
            rol: rolNormalizado,
            estadoUsuario: 'activo',
        }
     });
    } catch (error) {
        console.error('Error al registrar el usuario:', error);
        return res.status(500).json({ mensaje: 'Error del servidor. Por favor, intente nuevamente más tarde.' });
    }
};

//DELETE para eliminar un usuario por su ID
export const eliminarUsuario = async (req, res) => {
    try {
        const pool = getPool();
        const { id } = req.params;

        if (!/^\d+$/.test(id)) {
            return res.status(400).json({ mensaje: "Identificador de usuario inválido." });
        }

        const [usuarios] = await pool.query(
            "SELECT id, rol FROM usuarios WHERE id = ? LIMIT 1",
            [id]
        );
        const usuarioObjetivo = usuarios[0];
        if (!usuarioObjetivo) {
            return res.status(404).json({ mensaje: "Usuario no encontrado." });
        }

        const esPropiaCuenta = String(req.usuario.id) === String(usuarioObjetivo.id);
        const esAdministrador = normalizeRole(req.usuario.rol) === "admin";

        if (esPropiaCuenta && esAdministrador) {
            return res.status(403).json({ mensaje: "No puedes eliminar tu propia cuenta de administrador." });
        }
        if (!esPropiaCuenta && !esAdministrador) {
            return res.status(403).json({ mensaje: "No tienes permiso para eliminar esta cuenta." });
        }

        const [result] = await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
        }

        res.status(200).json({ mensaje: 'Usuario eliminado correctamente.' 
        });
    } catch (error) {
        console.error("Error al eliminar usuario:", error);
        res.status(500).json({ mensaje: 'Error al eliminar cuenta. Por favor, intente nuevamente más tarde.',
        });
    }
};

//GET para obtener solo especialistas
export const obtenerEspecialistas = async (req, res) => {
    try {
                const pool = getPool();
                const [rows] = await pool.query(
                    `SELECT id, nombresApellidos
                     FROM usuarios
                     WHERE rol = 'especialista' AND estadoUsuario = 'activo'`
                );

                const especialistas = rows.map((row) => ({
                    _id: toId(row.id),
                    id: toId(row.id),
                    nombresApellidos: row.nombresApellidos,
                }));

        res.json(especialistas);
    } catch (error) {
        console.error('Error al obtener especialistas:', error);
        res.status(500).json({ mensaje: 'Error del servidor. Por favor, intente nuevamente más tarde.' });
    }
};

//GET para obtener todos los usuarios
export const obtenerUsuarios = async (req, res) => {
    try {
                const pool = getPool();
                const [rows] = await pool.query(
                    `SELECT id, nombresApellidos, documentoIdentidad, email, rol, estadoUsuario, telefono, fechaRegistro
                     FROM usuarios
                     ORDER BY fechaRegistro DESC`
                );

                const usuarios = rows.map((row) => ({
                    _id: toId(row.id),
                    id: toId(row.id),
                    nombresApellidos: row.nombresApellidos,
                    documentoIdentidad: row.documentoIdentidad,
                    email: row.email,
                    rol: row.rol,
                    estadoUsuario: row.estadoUsuario,
                    telefono: row.telefono,
                    createdAt: row.fechaRegistro,
                }));

        res.json(usuarios);
    } catch (error) {
        console.error('Error al obtener usuarios:', error);
        res.status(500).json({ mensaje: 'Error del servidor. Por favor, intente nuevamente más tarde.' });
    }
};

//GET para obtener un usuario por ID
export const obtenerUsuarioPorId = async (req, res) => {
    try {
                const pool = getPool();
        const { id } = req.params;

                const [rows] = await pool.query(
                    `SELECT id, nombresApellidos, documentoIdentidad, email, rol, estadoUsuario, telefono, direccion
                     FROM usuarios
                     WHERE id = ?
                     LIMIT 1`,
                    [id]
                );

                const usuario = rows[0];

        if (!usuario) {
            return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
        }

                res.json({
                    _id: toId(usuario.id),
                    id: toId(usuario.id),
                    nombresApellidos: usuario.nombresApellidos,
                    documentoIdentidad: usuario.documentoIdentidad,
                    email: usuario.email,
                    rol: usuario.rol,
                    estadoUsuario: usuario.estadoUsuario,
                    telefono: usuario.telefono,
                    direccion: usuario.direccion,
                });
    } catch (error) {
        console.error('Error al obtener usuario:', error);
        res.status(500).json({ mensaje: 'Error del servidor. Por favor, intente nuevamente más tarde.' });
    }
};

//PUT para actualizar un usuario
export const actualizarUsuario = async (req, res) => {
  try {
        const pool = getPool();
    const { id } = req.params;
    let { nombresApellidos, email, telefono, direccion, estadoUsuario } = req.body;

    nombresApellidos = typeof nombresApellidos === "string" ? nombresApellidos.trim() : "";
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    telefono = typeof telefono === "string" ? telefono.trim() : "";
    direccion = typeof direccion === "string" ? direccion.trim() : "";
    estadoUsuario = typeof estadoUsuario === "string" ? estadoUsuario.trim().toLowerCase() : "";

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({ mensaje: "Identificador de usuario inválido." });
    }
    if (!nombresApellidos || !/^[\p{L}\s'-]+$/u.test(nombresApellidos)) {
      return res.status(400).json({ mensaje: "Ingrese un nombre válido." });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ mensaje: "El correo electrónico debe tener un formato válido." });
    }
    if (!/^\d{7,10}$/.test(telefono)) {
      return res.status(400).json({ mensaje: "El teléfono debe tener entre 7 y 10 dígitos." });
    }
    if (direccion.length < 5) {
      return res.status(400).json({ mensaje: "La dirección debe tener al menos 5 caracteres." });
    }
    if (!["activo", "inactivo"].includes(estadoUsuario)) {
      return res.status(400).json({ mensaje: "Estado de usuario inválido." });
    }

    const [duplicados] = await pool.query(
      "SELECT id FROM usuarios WHERE email = ? AND id <> ? LIMIT 1",
      [email, id]
    );
    if (duplicados.length > 0) {
      return res.status(409).json({ mensaje: "El correo ya está registrado por otro usuario." });
    }
        await pool.query(
            `UPDATE usuarios
             SET nombresApellidos = ?, email = ?, telefono = ?, direccion = ?, estadoUsuario = ?
             WHERE id = ?`,
            [nombresApellidos, email, telefono, direccion, estadoUsuario, id]
    );

        const [rows] = await pool.query(
            `SELECT id, nombresApellidos, email, telefono, direccion, estadoUsuario
             FROM usuarios WHERE id = ? LIMIT 1`,
            [id]
        );

        const usuarioActualizado = rows[0];

    if (!usuarioActualizado) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado.' });
    }

    res.status(200).json({ 
      mensaje: 'Usuario actualizado correctamente.',
            usuario: {
                _id: toId(usuarioActualizado.id),
                id: toId(usuarioActualizado.id),
                nombresApellidos: usuarioActualizado.nombresApellidos,
                email: usuarioActualizado.email,
                telefono: usuarioActualizado.telefono,
                direccion: usuarioActualizado.direccion,
                estadoUsuario: usuarioActualizado.estadoUsuario,
            }
    });
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ mensaje: 'Error del servidor. Por favor, intente nuevamente más tarde.' });
  }
};

