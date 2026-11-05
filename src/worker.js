// Only the game paths of run_worker_first reach this code; everything else is static.
export default {
  fetch(request, env) {
    const slug = new URL(request.url).pathname.split('/')[1] ?? '';
    const game = env[`GAME_${slug.toUpperCase().replaceAll('-', '_')}`];
    if (!game) return env.ASSETS.fetch(request);
    return game.fetch(request).catch(() => new Response('Game unavailable', { status: 502 }));
  },
};
