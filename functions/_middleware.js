export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (url.pathname === "/data/pins.json") {
    return new Response("Not found", { status: 404 });
  }

  return context.next();
}
