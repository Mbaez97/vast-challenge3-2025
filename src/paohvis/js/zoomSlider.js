// single range slider with default tooltip open
var pmdSliderTooltip = document.getElementById('pmd-slider-tooltip');
createSlider(1,4);

pmdSliderTooltip.noUiSlider.on('slide', function(){
  var value = parseInt(pmdSliderTooltip.noUiSlider.get());
  slide(value);
});


function double() {
//                var max = parseInt(document.getElementById("lblmax").textContent) * 2;
//                var value = parseInt(pmdSliderTooltip.noUiSlider.get());
//                if(max <=32) {
//                    pmdSliderTooltip.noUiSlider.destroy();
//                    document.getElementById("lblmax").innerHTML = max;
//                    createSlider(value,max);
//
//                    pmdSliderTooltip.noUiSlider.on('slide', function(){
//                        var value = parseInt(pmdSliderTooltip.noUiSlider.get());
//                        slide(value);
//                    });
//                }
  updateSlider(2);
}

function half() {
//                var max = parseInt(document.getElementById("lblmax").textContent) / 2;
//                var value = parseInt(pmdSliderTooltip.noUiSlider.get());
//                if(max < value){
//                    value = max;
//                    slide(value);
//                }
//                if(max >=2){
//                    pmdSliderTooltip.noUiSlider.destroy();
//                    document.getElementById("lblmax").innerHTML = max;
//                    createSlider(value,max);
//
//                    pmdSliderTooltip.noUiSlider.on('slide', function(){
//                        var value = parseInt(pmdSliderTooltip.noUiSlider.get());
//                        slide(value);
//                    });
//                }
  updateSlider(0.5);
}

function updateSlider(multiplier) {
  var max = parseInt(document.getElementById("lblmax").textContent) * multiplier;
  var value = parseInt(pmdSliderTooltip.noUiSlider.get());
  if(max < value){
    value = max;
    slide(value);
  }
  if(max >= 2 && max <= 32){
    pmdSliderTooltip.noUiSlider.destroy();
    document.getElementById("lblmax").innerHTML = max;
    createSlider(value,max);

    pmdSliderTooltip.noUiSlider.on('slide', function(){
      var value = parseInt(pmdSliderTooltip.noUiSlider.get());
      slide(value);
    });
  }
}

function increase() {
//                var value = parseInt(pmdSliderTooltip.noUiSlider.get());
//                pmdSliderTooltip.noUiSlider.set(value+1);

}

function decrease(){
//                var value = parseInt(pmdSliderTooltip.noUiSlider.get());
//                pmdSliderTooltip.noUiSlider.set(value-1);
  changeSlideValue(-1);
}

function changeSlideValue(valueToAdd){
  var value = parseInt(pmdSliderTooltip.noUiSlider.get());
  var maxLabel = parseInt(document.getElementById("lblmax").textContent);
  var minLabel = parseInt(document.getElementById("lblmin").textContent);
  var newValue = (value + valueToAdd);

  if (newValue >= minLabel && newValue <= maxLabel) {
    pmdSliderTooltip.noUiSlider.set(newValue);
  }

  if (newValue > maxLabel){
    double();
    pmdSliderTooltip.noUiSlider.set(newValue);
  }
}

function slide(value){
  var a = {"input":value};
  slide_zoom(a);
}

function createSlider(value,max){
  noUiSlider.create(pmdSliderTooltip, {
    start: value,
    connect: 'lower',
    tooltips: [wNumb({ decimals: 0 }) ],
    range: {
      'min': [ 1 ],
      'max': max
    },
    step: 1,
    pips: { // Show a scale with the slider
      mode: 'steps',
      density: 100,
    }
  });
}