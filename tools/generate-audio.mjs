// Genera los clips de audio del juego con ElevenLabs UNA SOLA VEZ.
// Guarda los .mp3 en /audio para que el juego los reproduzca localmente
// (sin gastar creditos en cada partida y sin exponer la API key en el navegador).
//
// Uso (desde la raiz del proyecto, con la key en el entorno):
//   $env:ELEVENLABS_API_KEY="tu_key"; node tools/generate-audio.mjs
//
// Genera pocos clips reutilizables para no malgastar creditos:
//   - audio/ambience_forest.mp3  (bosque nocturno, loop)
//   - audio/jumpscare.mp3        (chillido al ser atrapado)
//   - audio/whisper_1..3.mp3     (susurros de "lectura" de notas)

import { writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const API = "https://api.elevenlabs.io/v1";
const KEY = process.env.ELEVENLABS_API_KEY;
const OUT = path.resolve(process.cwd(), "public", "audio");

if (!KEY) {
  console.error("\n[ERROR] Falta ELEVENLABS_API_KEY en el entorno.");
  console.error('  PowerShell:  $env:ELEVENLABS_API_KEY="tu_key"; node tools/generate-audio.mjs\n');
  process.exit(1);
}

const headers = { "xi-api-key": KEY, "Content-Type": "application/json" };

async function save(name, bytes) {
  const file = path.join(OUT, name);
  await writeFile(file, Buffer.from(bytes));
  console.log(`  ✓ ${name}  (${(bytes.byteLength / 1024).toFixed(0)} KB)`);
}

async function soundEffect(name, text, opts = {}) {
  console.log(`- Efecto: ${name}`);
  const res = await fetch(`${API}/sound-generation`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      duration_seconds: opts.duration ?? 6,
      prompt_influence: opts.influence ?? 0.4,
      loop: opts.loop ?? false,
    }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  await save(name, await res.arrayBuffer());
}

async function getVoices() {
  const res = await fetch(`${API}/voices`, { headers });
  if (!res.ok) throw new Error(`voices: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.voices || []).map((v) => v.voice_id);
}

async function tts(name, voiceId, text) {
  console.log(`- Voz: ${name}`);
  const res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.35, similarity_boost: 0.7, style: 0.4, use_speaker_boost: true },
    }),
  });
  if (!res.ok) throw new Error(`${name}: ${res.status} ${await res.text()}`);
  await save(name, await res.arrayBuffer());
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  console.log(`\nGenerando audio en: ${OUT}\n`);

  // 1) Ambiente de bosque (loop)
  await soundEffect(
    "ambience_forest.mp3",
    "A seamless nighttime forest ambience: distant crickets, a soft cold wind through pines, occasional far owl, a faint uneasy low drone underneath",
    { duration: 22, loop: true, influence: 0.3 }
  );

  // 2) Jumpscare (impacto, sin loop)
  await soundEffect(
    "jumpscare.mp3",
    "A sudden violent burst of harsh static and a deep bass hit with a metallic distorted shriek, very short and terrifying, sharp transient",
    { duration: 2, loop: false, influence: 0.6 }
  );

  // 3) Susurros de lectura (voces del catalogo de la cuenta)
  const voices = await getVoices();
  if (!voices.length) {
    console.warn("  ! No hay voces en la cuenta; se omiten los susurros (el juego usara murmullo procedural).");
  } else {
    const whispers = [
      "no deberias estar aqui... da la vuelta... el bosque ya sabe tu nombre...",
      "otro mas... otro nino que no volvera... quedate... quedate con nosotros...",
      "lo escuchas... esta cerca... no te muevas... no respires... no mires...",
    ];
    for (let i = 0; i < whispers.length; i++) {
      const voice = voices[i % voices.length];
      await tts(`whisper_${i + 1}.mp3`, voice, whispers[i]);
    }
  }

  console.log("\nListo. Los clips estan en /audio. Recarga el juego para escucharlos.\n");
}

main().catch((e) => {
  console.error("\n[FALLO] " + e.message + "\n");
  process.exit(1);
});
