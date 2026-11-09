// JavaScript graphics: change the curve with the slider.
const x = Array.from({length: 300}, (_, i) => i * 2 * Math.PI / 299);
const wave = amplitude => x.map(value => amplitude * Math.sin(value));
const chart = graphics.plot(x, wave(1), {
  title: "Play with a sine wave",
  xlabel: "x",
  ylabel: "y",
  ylim: [-3, 3]
});

const amplitude = chart.slider({
  label: "Amplitude",
  min: 0.1,
  max: 3,
  step: 0.1,
  value: 1,
  onChange: value => chart.setData(x, wave(value))
});
chart.button("Reset amplitude", () => {
  amplitude.value = 1;
  amplitude.dispatchEvent(new Event("input"));
});
console.log("Drag the amplitude slider, or use Pan and Zoom above the plot.");
