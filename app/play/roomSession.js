// The seam for the world-model room view. This is the ONLY file that will
// import the Reactor SDK. Today it shows the room's seed image (or a
// placeholder card) with the lens applied as a CSS filter, so the whole
// enter/exit/idle lifecycle can be exercised without a model.
//
// To integrate Lingbot-World-2, fill in the TODO(reactor) blocks following
// CLAUDE.md §9. Read docs.reactor.inc/model-api-reference/lingbot-world-2/schema.md
// first and use its exact command names. Sessions bill per second while open,
// so exit() must run on every path out of a room.

const IDLE_MS = 60_000;      // close a session with no input for 60 s
const DOOR_MS = 600;         // how long the "door opening" overlay shows for the placeholder

export function createRoomSession({ root, map, role, lens }) {
  let room = null;
  let idleTimer = null;
  let doorTimer = null;

  function enter(id) {
    if (id === room) return;
    exit();
    room = id;
    const r = map.rooms[id];
    const seed = seedImageUrl(map, id);
    root.innerHTML =
      '<img alt="" src="' + seed + '">' +
      '<div class="card" hidden><b>' + r.label.toUpperCase() + '</b><p>' + r.prompt + ', ' + map.styleSuffix + '</p>' +
      '<p>No seed image at <code>' + seed + '</code> yet. Run <code>scripts/gen-rooms.ts</code>.</p></div>' +
      '<div class="tag">' + role.toUpperCase() + ' LENS · SEED IMAGE · WORLD MODEL NOT CONNECTED</div>' +
      '<div class="overlay">DOOR OPENING…</div>';
    const img = root.querySelector('img');
    img.onerror = () => { img.hidden = true; root.querySelector('.card').hidden = false; };
    root.hidden = false;
    doorTimer = setTimeout(() => root.querySelector('.overlay')?.classList.add('hidden'), DOOR_MS);
    touch();

    // TODO(reactor): replace the placeholder above with a live session.
    //  1. const { jwt, model } = await (await fetch('/api/token')).json();
    //  2. reactor = new Reactor({ modelName: model });  await reactor.connect(jwt);
    //  3. on status 'ready':
    //       const image = await reactor.uploadFile(seed);        // public/rooms/<room>.png
    //       sendCommand('set_image', { image });
    //       sendCommand('set_prompt', { prompt: lens });         // the role's lens
    //       sendCommand('start', {});
    //  4. attach the main_video track to a full-screen <video>; hide the
    //     "door opening" overlay on the first frame instead of a timer.
    //  5. on any error: keep the seed image still, show a "signal lost"
    //     overlay, and leave the game running. The map never depends on this.
    //  6. if exit() is called before 'ready', cancel and disconnect anyway.
  }

  /** Called for every move key while in a room. */
  function input(dir) {
    if (!room) return;
    touch();
    // TODO(reactor): forward WASD / mouse-look to the session using the
    // exact command names from the schema page. Do not guess them.
  }

  function exit() {
    if (!room) return;
    room = null;
    clearTimeout(idleTimer);
    clearTimeout(doorTimer);
    root.innerHTML = '';
    root.hidden = true;
    // TODO(reactor): reactor.disconnect() (non-recoverable); drop the <video>.
  }

  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const overlay = root.querySelector('.overlay');
      if (overlay) { overlay.textContent = 'IDLE · SESSION CLOSED'; overlay.classList.remove('hidden'); }
      // TODO(reactor): close the session here but keep the still on screen;
      // the next input() should reopen it.
    }, IDLE_MS);
  }

  // every path out: tab closed, navigated away, reloaded
  window.addEventListener('pagehide', exit);

  return { enter, exit, input, get room() { return room; } };
}

/** public/ is served at the site root by Next.js; under the static server it is ../../public/. */
export function seedImageUrl(map, roomId) {
  const base = location.pathname.includes('/app/') ? '../../public/rooms/' : '/rooms/';
  return base + roomId + '.png';
}
