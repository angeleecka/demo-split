// src\schemas\api.js

/** @typedef {{ oldPath: string, newPath: string }} RenameBody */
/** @typedef {{ ok: boolean, message?: string }} ApiResponse */

export const API = Object.freeze({
  renameUrl: "/rename",
  uploadUrl: "/upload-file",
});

/**
 * Примитивный рантайм-чек ответа. Можно заменить на zod/valibot в будущем.
 * @param {Response} res
 * @returns {Promise<ApiResponse>}
 */
export async function handle(res) {
  try {
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, message: data?.message };
  } catch (e) {
    return { ok: res.ok, message: undefined };
  }
}
