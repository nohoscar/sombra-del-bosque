# Genera las voces del modo historia con ElevenLabs (una sola vez).
# Modelo eleven_v3: actua las lineas con etiquetas como [susurrando] o [con miedo].
# Guarda cada linea en public/audio/voz/<clave>.mp3 y le iguala el volumen con ffmpeg.
# Si el archivo ya existe, no lo vuelve a pedir.
# La clave de la API se toma del helper local eleven_check (no se guarda en este repo).
#
# Uso:  py -3 tools/generar_voces.py                    (desde la raiz del proyecto)
#       py -3 tools/generar_voces.py --rehacer pr_caja  (vuelve a generar esas lineas)
#       py -3 tools/generar_voces.py --todo             (vuelve a generar todas)
import json, os, subprocess, sys, urllib.parse, urllib.request

sys.path.insert(0, r"C:\Users\nohoscar\Desktop\La Milpa\programa")
from eleven_check import clave  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "voz")
API = "https://api.elevenlabs.io/v1"

# Voces en espanol mexicano / latino (biblioteca de ElevenLabs)
ALEX = ("vPrtQbTwtAoP87VnQmID", "Mateo Aragon")
TOMMY = ("ihKwLOjVUMG4lgUI6meZ", "Leo")
PAPA = ("ojGau167OE7nUATM1xDa", "Marto")
MILLER = ("iDEmt5MnqUotdwCIVplo", "Enrique Mondragon")
CONSEJERA = ("hHjbwzYZW17oh0p05AKv", "Gabriela")

LINEAS = {
    "op_1": (ALEX, "[cansado, en voz baja] Papá tenía turno doble esa noche. Me tocaba cuidar a Tommy. [suspira] Como siempre."),
    "op_2": (ALEX, "[inquieto] Al pasar junto al bosque... sentí que algo me miraba. [pausa] Algo alto. [susurrando] Quieto."),
    "op_3": (ALEX, "Cuando llegué, la casa estaba a oscuras. [pausa] [con miedo] Y la ventana del cuarto de Tommy... abierta de par en par."),
    "pr_tommy": (ALEX, "[susurrando] ¿Tommy?... [pausa] ¿Ya estás dormido?"),
    "pr_contestadora": (PAPA, "[cansado] Alex, soy papá. Me toca doble turno, llego en la mañana. Cuida a tu hermano. [pausa] [más serio, en voz baja] Y cierra la ventana de su cuarto, ¿sí? Aunque haga calor. [suplicando] Por favor."),
    "pr_dibujo": (ALEX, "[en voz baja, extrañado] Es un dibujo de Tommy. Él, en el bosque... de la mano de un señor muy alto. [pausa] El señor no tiene cara. [con miedo] Y abajo escribió: mi amigo dice que el tío Daniel me espera."),
    "pr_ventana": (ALEX, "[respirando agitado, con miedo] Había alguien allá afuera... junto a los pinos."),
    "pr_caja": (ALEX, "[en voz baja] La caja de papá. La que nunca abre. [pausa] Un recorte de mil novecientos setenta y uno. Niño de nueve años desaparece en el bosque de Willow Creek. Su hermano mayor fue el único testigo. [pausa larga] [voz quebrada] Se llamaba Daniel. Tenía nuestro apellido."),
    "pr_linterna": (ALEX, "[aliviado, en voz baja] La linterna de papá."),
    "pr_salir": (ALEX, "[decidido, con miedo] Las huellas van hacia el bosque. [traga saliva] Tengo que ir por él."),
    "in_1": (ALEX, "[en voz baja] Seguí sus huellas hasta donde empiezan los pinos. No le avisé a nadie. [risa amarga] ¿Quién me iba a creer?"),
    "n1_inicio": (ALEX, "[susurrando] Las huellas siguen el sendero. Las de Tommy... [pausa] y otras."),
    "n1_arbusto": (ALEX, "[susurrando, conteniendo la respiración] Aquí no me ve. [pausa] Creo."),
    "n1_ahi": (ALEX, "[aterrado, en un susurro] Ahí está."),
    "n1_huellas": (ALEX, "[en voz baja, con miedo] Pasos de tres metros. Ningún hombre camina así. [pausa] Y cada tanto... dejan de tocar el suelo."),
    "n1_miller": (MILLER, "[cansado, voz grave] Día catorce de búsqueda. Nunca hay cuerpos. [pausa] Nunca. [en voz baja] Los perros no ladran... se sientan... y miran hacia arriba."),
    "n1_baliza": (ALEX, "[susurrando] La baliza del sendero está apagada. Si la enciendo, veré el camino. [pausa] Pero él también me verá a mí. [decidido] Aguanta, Tommy."),
    "n1_tommy": (TOMMY, "[susurro infantil, asustado] Alex... no vengas. [pausa] [voz quebrada] Él dice que tú también eres de la familia."),
    "n2_inicio": (ALEX, "[en voz baja, inquieto] El campamento Willow. Cerrado hace años. [pausa] Y la fogata... sigue encendida."),
    "n2_bitacora": (CONSEJERA, "[cansada, nerviosa] Noche seis. Los niños dibujan al hombre flaco de los pinos. Les dije que no existe. [pausa] Hoy conté las literas. Falta una. [en voz baja] Y nadie recuerda de quién era."),
    "n2_cab1": (ALEX, "[susurrando] Tres literas."),
    "n2_cab2": (ALEX, "[susurrando] Seis."),
    "n2_cab3": (ALEX, "[susurrando, nervioso] Nueve."),
    "n2_literas": (ALEX, "[con miedo, en voz baja] Once. Solo once camas... [pausa] y en la lista hay doce nombres."),
    "n2_cinta": (CONSEJERA, "[cantando bajito, como a niños] Canten más fuerte, niños... más fuerte. [pausa] [susurrando, con miedo] Si lo ven... no lo miren a la cara."),
    "n2_tommy": (TOMMY, "[susurro infantil] Alex... por aquí. [pausa] Ven."),
    "n2_nolo": (ALEX, "[aterrado, en voz baja] Esa no es la voz de Tommy."),
    "n2_dibujo": (ALEX, "[en voz baja] Niños en círculo. En medio, la figura sin cara. [pausa] Los años: cincuenta y tres, setenta y uno, ochenta y cinco... [voz quebrada] noventa y ocho. Abajo dice: él nos cuida ahora."),
    "n2_final": (ALEX, "[agotado, en voz baja] La fogata se apagó sola. En el humo, por un segundo, vi a doce niños. [pausa larga] [voz quebrada] Uno traía la gorra de Tommy."),
}

H = {"xi-api-key": clave(), "Content-Type": "application/json"}


def pedir(url, body=None, raw=False):
    r = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers=H,
                               method="POST" if body is not None else "GET")
    with urllib.request.urlopen(r, timeout=180) as f:
        return f.read() if raw else json.load(f)


def asegurar_voces():
    """Agrega a la cuenta las voces de la biblioteca que aun no estan."""
    mias = {v["voice_id"] for v in pedir(f"{API}/voices")["voices"]}
    for vid, nombre in {ALEX, TOMMY, PAPA, MILLER, CONSEJERA}:
        if vid in mias:
            continue
        d = pedir(f"{API}/shared-voices?page_size=30&language=es&search={urllib.parse.quote(nombre)}")
        v = next(x for x in d["voices"] if x["voice_id"] == vid)
        pedir(f"{API}/voices/add/{v['public_owner_id']}/{vid}", {"new_name": "SDB " + nombre})
        print("  voz agregada:", nombre)


def generar(key, voz, texto):
    body = {"text": texto, "model_id": "eleven_v3", "voice_settings": {"stability": 0.5, "similarity_boost": 0.8}}
    data = pedir(f"{API}/text-to-speech/{voz[0]}?output_format=mp3_44100_128", body, raw=True)
    crudo = os.path.join(OUT, key + ".crudo.mp3")
    final = os.path.join(OUT, key + ".mp3")
    with open(crudo, "wb") as f:
        f.write(data)
    # Mismo volumen para todas las lineas
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", crudo, "-af", "loudnorm=I=-19:TP=-2:LRA=11",
                    "-ar", "44100", "-b:a", "128k", final], check=True)
    os.remove(crudo)


def main():
    os.makedirs(OUT, exist_ok=True)
    todo = "--todo" in sys.argv
    rehacer = set(sys.argv[sys.argv.index("--rehacer") + 1:]) if "--rehacer" in sys.argv else set()
    asegurar_voces()
    usados = 0
    for key, (voz, texto) in LINEAS.items():
        if os.path.exists(os.path.join(OUT, key + ".mp3")) and not todo and key not in rehacer:
            continue
        generar(key, voz, texto)
        usados += len(texto)
        print(f"  ok {key}")
    print(f"Listo. Caracteres usados: {usados}")


if __name__ == "__main__":
    main()
