// Generado con asistencia de IA (Claude) – revisado por Alex Matos, 31/10/2026
import { test, expect } from "@playwright/test";

/**
 * TR-08 Documentación de ayuda del usuario (issue #89)
 * Un test por criterio de aceptación comprobable. El criterio 3 («se actualiza en cada
 * sprint antes de la demo») es de proceso: lo cubre el criterio 2 con la lista de flujos.
 * Solo necesita el frontend en marcha (la página no llama a la API).
 */
const HOME_PATH = "/";
const HELP_PATH = "/ayuda";

// Sin el desplazamiento suave (la web lo quita con «reducir movimiento»): si no, al pulsar el
// siguiente enlace del índice mientras sigue el desplazamiento anterior, a veces no se llega al
// apartado, sobre todo al último. El test sigue comprobando que el enlace lleva a su apartado.
test.use({ reducedMotion: "reduce" });

// Sin el desplazamiento suave (la web lo quita con «reducir movimiento»): si no, al pulsar el
// siguiente enlace del índice mientras sigue el desplazamiento anterior, a veces no se llega al
// apartado, sobre todo al último. El test sigue comprobando que el enlace lleva a su apartado.
test.use({ reducedMotion: 'reduce' });

// Flujos entregados hasta ahora. Al entregar uno nuevo, se añade aquí y en la página.
const DELIVERED_FLOWS = [
  "Crear una cuenta",
  "Hacerte rider",
  "Aceptar trabajos de entrega",
  "Iniciar sesión",
  "Ver y editar tu perfil",
  "Cerrar sesión",
  "Buscar un objeto",
  "Filtrar los resultados",
  "Ver la ficha de un objeto",
  "Solicitar un alquiler",
  "Consultar tus solicitudes",
  "Aceptar o rechazar una solicitud",
  "Seguir la entrega",
  "Valorar un alquiler",
  "Valorar a quien te ha alquilado un objeto",
  "Cancelar una reserva",
  "Publicar un objeto",
  "Editar un objeto",
  "Pausar o reanudar un objeto",
  "Retirar un objeto",
];

// Criterio 1
test("la página de ayuda se abre desde la cabecera sin iniciar sesión", async ({
  page,
}) => {
  await page.goto(HOME_PATH);

  await page.getByRole("banner").getByRole("link", { name: "Ayuda" }).click();

  await expect(page).toHaveURL(HELP_PATH);
  await expect(
    page.getByRole("heading", { level: 1, name: "Ayuda" }),
  ).toBeVisible();
});

// Criterio 2
test("explica cada flujo entregado con sus pasos y se puede ir a él desde el índice", async ({
  page,
}) => {
  await page.goto(HELP_PATH);
  const index = page.getByRole("navigation", { name: "En esta página" });

  for (const flow of DELIVERED_FLOWS) {
    const section = page.getByRole("region", { name: flow });
    await expect(section.getByRole("listitem").first()).toBeVisible();

    await index.getByRole("link", { name: flow }).click();
    await expect(section.getByRole("heading", { name: flow })).toBeInViewport();
  }
});
