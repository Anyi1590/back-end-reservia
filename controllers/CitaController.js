import { getPool } from "../config/db.js";
import { toDateOnly, toId, toTimeHHMM } from "../utils/mysqlMappers.js";
import { getTodayDateOnly, isDateOnly } from "../utils/dateValidation.js";

const mapCitaConEspecialista = (row) => ({
  _id: toId(row.id),
  id: toId(row.id),
  cliente: toId(row.cliente),
  especialista: {
    _id: toId(row.especialista),
    id: toId(row.especialista),
    nombresApellidos: row.especialistaNombre,
  },
  fecha: toDateOnly(row.fecha),
  horaInicio: toTimeHHMM(row.horaInicio),
  horaFin: toTimeHHMM(row.horaFin),
  estado: row.estado,
  motivoCancelacion: row.motivoCancelacion,
  canceladaPor: row.canceladaPor,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const mapCitaConClienteYEspecialista = (row) => ({
  _id: toId(row.id),
  id: toId(row.id),
  cliente: {
    _id: toId(row.cliente),
    id: toId(row.cliente),
    nombresApellidos: row.clienteNombre,
    email: row.clienteEmail,
    telefono: row.clienteTelefono,
  },
  especialista: {
    _id: toId(row.especialista),
    id: toId(row.especialista),
    nombresApellidos: row.especialistaNombre,
  },
  fecha: toDateOnly(row.fecha),
  horaInicio: toTimeHHMM(row.horaInicio),
  horaFin: toTimeHHMM(row.horaFin),
  estado: row.estado,
  motivoCancelacion: row.motivoCancelacion,
  canceladaPor: row.canceladaPor,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

// Obtener citas de un cliente

// Obtener citas pendientes del cliente
export const obtenerCitaCliente = async (req, res) => {
  try {
    const pool = getPool();
    const { cliente } = req.params;

    const [rows] = await pool.query(
      `SELECT c.id, c.cliente, c.especialista, c.fecha, c.horaInicio, c.horaFin, c.estado,
              c.motivoCancelacion, c.canceladaPor, c.createdAt, c.updatedAt,
              e.nombresApellidos AS especialistaNombre
       FROM citas c
       INNER JOIN usuarios e ON e.id = c.especialista
       WHERE c.cliente = ?
         AND c.estado IN ('programada', 'cancelada')
       ORDER BY c.fecha DESC`,
      [cliente]
    );

    res.json(rows.map(mapCitaConEspecialista));
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener las citas" });
  }
}


// Obtener todas las citas de un especialista
export const obtenerCitasEspecialista = async (req, res) => {
  try {
    const pool = getPool();
    const { especialista } = req.params;

    const [rows] = await pool.query(
      `SELECT c.id, c.cliente, c.especialista, c.fecha, c.horaInicio, c.horaFin, c.estado,
              c.motivoCancelacion, c.canceladaPor, c.createdAt, c.updatedAt,
              cl.nombresApellidos AS clienteNombre, cl.email AS clienteEmail, cl.telefono AS clienteTelefono,
              e.nombresApellidos AS especialistaNombre
       FROM citas c
       INNER JOIN usuarios cl ON cl.id = c.cliente
       INNER JOIN usuarios e ON e.id = c.especialista
       WHERE c.especialista = ?
         AND c.estado IN ('programada', 'cancelada')
       ORDER BY c.fecha DESC`,
      [especialista]
    );

    res.json(rows.map(mapCitaConClienteYEspecialista));
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener las citas del especialista" });
  }
};


// Cancelar una cita
export const cancelarCita = async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { motivo } = req.body;

    const [citaRows] = await conn.query(
      `SELECT id, cliente, especialista, fecha, horaInicio, estado
       FROM citas
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    const cita = citaRows[0];

    if (!cita) {
      const error = new Error("Cita no encontrada.");
      error.statusCode = 404;
      throw error;
    }

    const rol = req.usuario?.rol;
    const esCliente = rol === "cliente" && String(cita.cliente) === String(req.usuario.id);
    const esEspecialista = rol === "especialista" && String(cita.especialista) === String(req.usuario.id);
    if (!esCliente && !esEspecialista) {
      const error = new Error("No tienes permiso para cancelar esta cita.");
      error.statusCode = 403;
      throw error;
    }
    if (cita.estado !== "programada") {
      const error = new Error("Solo se pueden cancelar citas programadas.");
      error.statusCode = 409;
      throw error;
    }
    if (motivo != null && typeof motivo !== "string") {
      const error = new Error("El motivo debe ser texto.");
      error.statusCode = 400;
      throw error;
    }
    const canceladaPor = esEspecialista ? "especialista" : "cliente";

    await conn.query(
      `UPDATE citas
       SET estado = 'cancelada', motivoCancelacion = ?, canceladaPor = ?
       WHERE id = ?`,
      [motivo || null, canceladaPor, id]
    );

    // liberar agenda
    const [agendaRows] = await conn.query(
      `SELECT id
       FROM agendas
       WHERE especialista = ? AND fecha = ?
       LIMIT 1`,
      [cita.especialista, toDateOnly(cita.fecha)]
    );

    if (agendaRows[0]) {
      await conn.query(
        `UPDATE agenda_bloques
         SET disponible = 1
         WHERE agenda_id = ? AND horaInicio = ?
         LIMIT 1`,
        [agendaRows[0].id, `${toTimeHHMM(cita.horaInicio)}:00`]
      );
    }

    await conn.commit();

    const [rows] = await pool.query(
      `SELECT c.id, c.cliente, c.especialista, c.fecha, c.horaInicio, c.horaFin, c.estado,
              c.motivoCancelacion, c.canceladaPor, c.createdAt, c.updatedAt,
              e.nombresApellidos AS especialistaNombre
       FROM citas c
       INNER JOIN usuarios e ON e.id = c.especialista
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );

    res.json(mapCitaConEspecialista(rows[0]));

  } catch (error) {
    await conn.rollback();
    if (!error.statusCode) {
      console.error("Error al cancelar cita:", error);
    }
    res.status(error.statusCode || 500).json({
      mensaje: error.statusCode ? error.message : "Error al cancelar la cita.",
    });
  } finally {
    conn.release();
  }
};
// Reprogramar una cita
export const reprogramarCita = async (req, res) => {
  const pool = getPool();
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { fecha, horaInicio, horaFin } = req.body;

    const [citaRows] = await conn.query(
      `SELECT id, cliente, especialista, estado
       FROM citas
       WHERE id = ?
       LIMIT 1
       FOR UPDATE`,
      [id]
    );

    const cita = citaRows[0];
    if (!cita) {
      const error = new Error("Cita no encontrada.");
      error.statusCode = 404;
      throw error;
    }
    if (String(cita.cliente) !== String(req.usuario.id)) {
      const error = new Error("No tienes permiso para reprogramar esta cita.");
      error.statusCode = 403;
      throw error;
    }
    if (cita.estado !== "cancelada") {
      const error = new Error("Solo se pueden reprogramar citas canceladas.");
      error.statusCode = 400;
      throw error;
    }

    const nuevaFecha = fecha;
    const horaInicioValida = typeof horaInicio === "string" && /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(horaInicio);
    const horaFinValida = typeof horaFin === "string" && /^([01]\d|2[0-3]):[0-5]\d(?::00)?$/.test(horaFin);
    const inicioHHMM = horaInicioValida ? horaInicio.slice(0, 5) : "";
    const finHHMM = horaFinValida ? horaFin.slice(0, 5) : "";

    if (!isDateOnly(nuevaFecha) || nuevaFecha < getTodayDateOnly()) {
      const error = new Error("Selecciona una fecha válida que no haya pasado.");
      error.statusCode = 400;
      throw error;
    }
    if (!horaInicioValida || !horaFinValida || finHHMM <= inicioHHMM) {
      const error = new Error("Selecciona un horario válido.");
      error.statusCode = 400;
      throw error;
    }

    const [agendaNuevaRows] = await conn.query(
      `SELECT id FROM agendas WHERE especialista = ? AND fecha = ? LIMIT 1`,
      [cita.especialista, nuevaFecha]
    );

    if (!agendaNuevaRows[0]) {
      const error = new Error("No hay agenda disponible para la fecha seleccionada.");
      error.statusCode = 400;
      throw error;
    }

    const [ocupado] = await conn.query(
      `SELECT id, horaFin, disponible
       FROM agenda_bloques
       WHERE agenda_id = ? AND horaInicio = ?
       LIMIT 1
       FOR UPDATE`,
      [agendaNuevaRows[0].id, `${inicioHHMM}:00`]
    );

    if (!ocupado[0] || !ocupado[0].disponible) {
      const error = new Error("El horario seleccionado ya no está disponible. Elige otro.");
      error.statusCode = 409;
      throw error;
    }
    if (toTimeHHMM(ocupado[0].horaFin) !== finHHMM) {
      const error = new Error("El horario seleccionado no coincide con la disponibilidad.");
      error.statusCode = 400;
      throw error;
    }

    const [bloqueActualizado] = await conn.query(
      `UPDATE agenda_bloques
       SET disponible = 0
       WHERE id = ? AND disponible = 1`,
      [ocupado[0].id]
    );
    if (bloqueActualizado.affectedRows === 0) {
      const error = new Error("El horario seleccionado ya no está disponible. Elige otro.");
      error.statusCode = 409;
      throw error;
    }

    await conn.query(
      `UPDATE citas
       SET fecha = ?, horaInicio = ?, horaFin = ?, estado = 'programada'
       WHERE id = ?`,
      [nuevaFecha, `${inicioHHMM}:00`, `${finHHMM}:00`, id]
    );

    await conn.commit();

    const [rows] = await pool.query(
      `SELECT c.id, c.cliente, c.especialista, c.fecha, c.horaInicio, c.horaFin, c.estado,
              c.motivoCancelacion, c.canceladaPor, c.createdAt, c.updatedAt,
              e.nombresApellidos AS especialistaNombre
       FROM citas c
       INNER JOIN usuarios e ON e.id = c.especialista
       WHERE c.id = ?
       LIMIT 1`,
      [id]
    );

    res.json(mapCitaConEspecialista(rows[0]));

  } catch (error) {
    await conn.rollback();
    if (!error.statusCode) {
      console.error("Error al reprogramar cita:", error);
    }
    res.status(error.statusCode || 500).json({
      mensaje: error.statusCode ? error.message : "Error al reprogramar la cita.",
    });
  } finally {
    conn.release();
  }
};
