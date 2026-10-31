## Qué hace este PR
<!-- Resumen en 1-3 frases -->

<!-- PR de tarea (task/ → feature/): «Parte de #<nº historia>»; el Closes no funciona fuera de develop. -->
<!-- PR de historia (feature/ → develop): un Closes por la historia y por cada tarea, p. ej. «Closes #50, closes #13, closes #14». -->
Closes #

## Historia de usuario
<!-- Ej.: US-01.1 Registro (#45) -->

## Cómo probarlo
1.

## Checklist
- [ ] La rama sigue GitFlow: `task/<nº tarea>-<descripcion>` para una tarea, `feature/<nº historia>-<descripcion>` para una historia (o `bugfix/`, `release/`, `hotfix/`)
- [ ] La base del PR es correcta: la rama `feature/` de su historia para `task/`; `develop` para `feature/` y `bugfix/`; `main` para `release/` y `hotfix/`
- [ ] Si es el PR de una historia a `develop`: he hecho `git rebase --rebase-merges origin/develop`, los tests pasan después del rebase y la descripción cierra la historia y todas sus tareas
- [ ] Se integrará con **Create a merge commit** (nunca *squash*)
- [ ] Cumple los criterios de aceptación de la historia
- [ ] Tiene tests y pasan en local (`npm run lint`, `npm test`, `npm run build`)
- [ ] He actualizado la documentación / página de ayuda si hacía falta
- [ ] He pedido revisión a otra persona del equipo
- [ ] Parte del código está generado con IA (indicado en el código si es un bloque grande)

## Capturas (si cambia la interfaz)
<!-- Wireframe de la historia (docs/wireframes/US-XX.YY-<nombre>/flujo.png) y, al lado, la captura de la pantalla real. -->
<!-- Si la pantalla ha cambiado respecto al wireframe, actualízalo en este PR (`cd e2e && npm run wireframes`). -->
