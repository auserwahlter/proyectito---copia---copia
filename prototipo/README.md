# MATCTRL · Torneos y directos

El panel MATCTRL contiene la operación del torneo: participantes, llaves,
marcador, retransmisión en vivo y biblioteca de grabaciones.

## Cuenta y contenido propio

Entra a MATCTRL desde una sesión iniciada en Luta e Dança. El token de esa
sesión identifica al creador; los torneos y emisiones nuevas quedan asociados
al ID de la cuenta y no a un nombre guardado en el navegador. Si tu sesión se
creó antes de esta integración, cierra sesión y vuelve a entrar para guardar el
token de acceso.

Cada cuenta comienza sin torneos de demostración. Usa **Crear mi primer torneo**
para iniciar uno desde cero; **Nuevo torneo** permite crear otros y el selector
de la barra lateral permite volver a los torneos guardados. Las emisiones
públicas en vivo y las repeticiones publicadas aparecen en el feed principal.
Las modificaciones de torneos y directos solo se permiten a su creador.

## Inicio integrado

Desde la raíz del proyecto, ejecuta `npm run dev` para iniciar la plataforma
principal y MATCTRL. Ambos se acceden desde el mismo puerto: la plataforma en
`http://localhost:5000` y el panel en `http://localhost:5000/matctrl/`.

Para el inicio integrado, configura `DATABASE_URL` y `JWT_SECRET` en el `.env`
de la raíz: ambos servicios heredan esa base compartida y la clave usada para
validar la sesión. El `.env` de `prototipo` se usa al ejecutar MATCTRL por
separado. Para cámara y grabaciones, inicia PostgreSQL y MediaMTX con
`npm --prefix prototipo run db:up`. MATCTRL usa un puerto loopback interno; los
navegadores no necesitan conectarse a ese puerto. La migración de propiedad de
torneos se aplica al iniciar MATCTRL.

Para producción, `npm start` construye MATCTRL y levanta ambos servidores.
