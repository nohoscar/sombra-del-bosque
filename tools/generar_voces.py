# Genera las voces del modo historia con ElevenLabs (una sola vez).
# Guarda cada linea en public/audio/voz/<clave>.mp3. Si el archivo ya existe, no lo vuelve a pedir.
# La clave de la API se toma del helper local eleven_check (no se guarda en este repo).
#
# Uso:  py -3 tools/generar_voces.py            (desde la raiz del proyecto)
#       py -3 tools/generar_voces.py --rehacer pr_caja   (vuelve a generar una linea)
import json, os, sys, urllib.request

sys.path.insert(0, r"C:\Users\nohoscar\Desktop\La Milpa\programa")
from eleven_check import clave  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "voz")

ALEX = "TX3LPaxmHKxFdv7VOQHJ"    # Liam: joven
TOMMY = "ihKwLOjVUMG4lgUI6meZ"   # Leo: nino latino
PAPA = "iP95p4xoKVk53GoZ742B"    # Chris: adulto
MILLER = "pqHfZKP75CvOlQylNhV4"  # Bill: viejo
CONSEJERA = "XrExE9yKIg1WjnnlVkGX"  # Matilda: adulta

NORMAL = {"stability": 0.45, "similarity_boost": 0.75, "style": 0.35, "use_speaker_boost": True}
TENSO = {"stability": 0.3, "similarity_boost": 0.75, "style": 0.55, "use_speaker_boost": True}

LINEAS = {
    "op_1": (ALEX, "Papá tenía turno doble esa noche. Me tocaba cuidar a Tommy. Como siempre.", NORMAL),
    "op_2": (ALEX, "Al pasar junto al bosque, sentí que algo me miraba. Algo alto. Quieto.", NORMAL),
    "op_3": (ALEX, "Cuando llegué, la casa estaba a oscuras. Y la ventana del cuarto de Tommy... abierta de par en par.", NORMAL),
    "pr_tommy": (ALEX, "¿Tommy? ... ¿Ya estás dormido?", NORMAL),
    "pr_contestadora": (PAPA, "Alex, soy papá. Me toca doble turno, llego en la mañana. Cuida a tu hermano. Y... cierra la ventana de su cuarto, ¿sí? Aunque haga calor. Por favor.", NORMAL),
    "pr_dibujo": (ALEX, "Es un dibujo de Tommy. Él, en el bosque, de la mano de un señor muy alto. El señor no tiene cara. Y abajo escribió: mi amigo dice que el tío Daniel me espera.", NORMAL),
    "pr_ventana": (ALEX, "Había alguien allá afuera. Junto a los pinos.", TENSO),
    "pr_caja": (ALEX, "La caja de papá. La que nunca abre. Un recorte de mil novecientos setenta y uno: niño de nueve años desaparece en el bosque de Willow Creek. Su hermano mayor fue el único testigo. Se llamaba Daniel. Tenía nuestro apellido.", NORMAL),
    "pr_linterna": (ALEX, "La linterna de papá.", NORMAL),
    "pr_salir": (ALEX, "Las huellas van hacia el bosque. Tengo que ir por él.", TENSO),
    "in_1": (ALEX, "Seguí sus huellas hasta donde empiezan los pinos. No le avisé a nadie. ¿Quién me iba a creer?", NORMAL),
    "n1_inicio": (ALEX, "Las huellas siguen el sendero. Las de Tommy... y otras.", NORMAL),
    "n1_arbusto": (ALEX, "Aquí no me ve. Creo.", TENSO),
    "n1_ahi": (ALEX, "Ahí está.", TENSO),
    "n1_huellas": (ALEX, "Pasos de tres metros. Ningún hombre camina así. Y cada tanto... dejan de tocar el suelo.", NORMAL),
    "n1_miller": (MILLER, "Día catorce de búsqueda. Nunca hay cuerpos. Nunca. Los perros no ladran... se sientan... y miran hacia arriba.", NORMAL),
    "n1_baliza": (ALEX, "La baliza del sendero está apagada. Si la enciendo, veré el camino. Pero él también me verá a mí. Aguanta, Tommy.", NORMAL),
    "n1_tommy": (TOMMY, "Alex... no vengas. Él dice que tú también eres de la familia.", TENSO),
    "n2_inicio": (ALEX, "El campamento Willow. Cerrado hace años. Y la fogata... sigue encendida.", TENSO),
    "n2_bitacora": (CONSEJERA, "Noche seis. Los niños dibujan al hombre flaco de los pinos. Les dije que no existe. Hoy conté las literas. Falta una. Y nadie recuerda de quién era.", NORMAL),
    "n2_literas": (ALEX, "Once camas. En la lista hay doce nombres.", NORMAL),
    "n2_cinta": (CONSEJERA, "Canten más fuerte, niños... más fuerte. Si lo ven... no lo miren a la cara.", TENSO),
    "n2_tommy": (TOMMY, "Alex... por aquí. Ven.", TENSO),
    "n2_nolo": (ALEX, "Esa no es la voz de Tommy.", TENSO),
    "n2_dibujo": (ALEX, "Niños en círculo. En medio, la figura sin cara. Los años: cincuenta y tres, setenta y uno, ochenta y cinco... noventa y ocho. Abajo dice: él nos cuida ahora.", NORMAL),
    "n2_final": (ALEX, "La fogata se apagó sola. En el humo, por un segundo, vi a doce niños. Uno traía la gorra de Tommy.", NORMAL),
}


def generar(key, voz, texto, ajustes):
    body = json.dumps({"text": texto, "model_id": "eleven_multilingual_v2", "voice_settings": ajustes}).encode()
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voz}?output_format=mp3_44100_128", data=body,
        headers={"xi-api-key": clave(), "Content-Type": "application/json", "Accept": "audio/mpeg"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = r.read()
    with open(os.path.join(OUT, key + ".mp3"), "wb") as f:
        f.write(data)
    return len(data)


def main():
    os.makedirs(OUT, exist_ok=True)
    rehacer = set(sys.argv[sys.argv.index("--rehacer") + 1:]) if "--rehacer" in sys.argv else set()
    gastados = 0
    for key, (voz, texto, ajustes) in LINEAS.items():
        ruta = os.path.join(OUT, key + ".mp3")
        if os.path.exists(ruta) and key not in rehacer:
            continue
        n = generar(key, voz, texto, ajustes)
        gastados += len(texto)
        print(f"  ok {key}  {n // 1024} KB")
    print(f"Listo. Caracteres usados: {gastados}")


if __name__ == "__main__":
    main()
