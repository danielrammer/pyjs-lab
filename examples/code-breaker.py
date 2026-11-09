import random

# Vier verschiedene Ziffern; der Textcode kann mit 0 beginnen.
secret = "".join(random.sample("0123456789", 4))
print("Codebreaker: Errate vier verschiedene Ziffern von 0 bis 9.")
print("Richtige Position = Ziffer und Platz stimmen.")
print("Andere Position = Ziffer stimmt, Platz stimmt nicht.")
print("Beginne z. B. mit 0123. Nutze dann die Rückmeldungen.")
attempt = 1
while attempt <= 10:
    guess = input(f"Versuch {attempt}/10: ").strip()
    if len(guess) != 4 or not guess.isascii() or not guess.isdigit():
        print("Bitte genau 4 Ziffern (0–9) eingeben. Kein Versuch verbraucht.")
        continue
    if len(set(guess)) != 4:
        print("Keine Ziffer darf doppelt vorkommen. Kein Versuch verbraucht.")
        continue
    correct_position = sum(a == b for a, b in zip(secret, guess))
    correct_digit = sum(digit in secret for digit in guess) - correct_position
    print("Tipp:", guess)
    if guess == secret:
        print("CODE GEKNACKT!")
        break
    print("Richtige Position:", correct_position)
    print("Richtige Ziffer, falsche Position:", correct_digit)
    attempt += 1
else:
    print("Verloren! Der Code war:", secret)
