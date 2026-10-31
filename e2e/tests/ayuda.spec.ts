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

// Flujos entregados hasta ahora. Al entregar uno nuevo, se añade aquí y en la página.
const DELIVERED_FLOWS = [
  "Crear una cuenta",
  "Iniciar sesión",
  "Ver tu perfil",
  "Cerrar sesión",
];

// Criterio 1
test("la página de ayuda se abre desde la cabecera sin iniciar sesión", async ({
  page,
}) => {
  await page.goto(HOME_PATH);

  await page
    .getByRole("navigation", { name: "Principal" })
    .getByRole("link", { name: "Ayuda" })
    .click();

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
