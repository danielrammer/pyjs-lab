# Function scopes, list methods, negative ranges, and interpolated output.
def summarize(values):
    total = 0
    selected = []
    for value in values:
        if value > 0 and value % 2 == 0:
            selected.append(value)
            total += value
        elif value == 0:
            continue
        else:
            total -= 1
    print(f"Selected: {len(selected)}; total: {total}")
    return total

def repeat_total(values):
    total = 0
    for value in values:
        total += value
    return total

values = [0, 2, 3, 4, -1, 6]
total = summarize(values)
print("True and False; {braces}; https://example.com", total)
print(repeat_total([1, 2, 3]))
for row in range(1, 4):
    for column in range(3, 0, -1):
        print(f"cell {row}:{column}")
countdown = 2
while countdown > 0:
    print(countdown)
    countdown -= 1
