import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// Tema oscuro azul marino tomado del prototipo de Figma (ver la paleta en el plan del proyecto).
export const COLORES = {
  fondoArchivos: '#0d1117',
  fondoBarras: '#0f1620',
  fondoCampos: '#131924',
  divisor: '#151e2c',
  bordeCampos: '#222b3b',
  filaSeleccionada: '#1a2d47',
  botonActivo: '#3d5b81',
  carpeta: '#4668a1',
  marca: '#6a4ea0',
  texto: '#9cbef0',
  textoDestacado: '#c9e3ff',
  textoSecundario: '#6b86b3',
};

export const TemaDeskCloud = definePreset(Aura, {
  primitive: {
    borderRadius: { none: '0', xs: '2px', sm: '4px', md: '6px', lg: '8px', xl: '12px' },
  },
  semantic: {
    primary: {
      50: '#eef3fb',
      100: '#d5e2f6',
      200: '#c9e3ff',
      300: '#9cbef0',
      400: '#7aa1dc',
      500: '#5c84c4',
      600: '#4668a1',
      700: '#3d5b81',
      800: '#2f4664',
      900: '#23344a',
      950: '#162233',
    },
    colorScheme: {
      dark: {
        surface: {
          0: '#ffffff',
          50: '#c9e3ff',
          100: '#9cbef0',
          200: '#86a6d6',
          300: '#6b86b3',
          400: '#546d97',
          500: '#3d5b81',
          600: '#2a3a52',
          700: '#222b3b',
          800: '#131924',
          900: '#0f1620',
          950: '#0d1117',
        },
        primary: {
          color: '#7aa1dc',
          contrastColor: '#0d1117',
          hoverColor: '#9cbef0',
          activeColor: '#c9e3ff',
        },
        highlight: {
          background: COLORES.filaSeleccionada,
          focusBackground: '#22385a',
          color: COLORES.textoDestacado,
          focusColor: COLORES.textoDestacado,
        },
        text: {
          color: COLORES.texto,
          hoverColor: COLORES.textoDestacado,
          mutedColor: COLORES.textoSecundario,
          hoverMutedColor: COLORES.texto,
        },
        content: {
          background: COLORES.fondoBarras,
          hoverBackground: COLORES.fondoCampos,
          borderColor: COLORES.bordeCampos,
          color: COLORES.texto,
          hoverColor: COLORES.textoDestacado,
        },
        formField: {
          background: COLORES.fondoCampos,
          disabledBackground: COLORES.divisor,
          filledBackground: COLORES.fondoCampos,
          filledHoverBackground: COLORES.fondoCampos,
          filledFocusBackground: COLORES.fondoCampos,
          borderColor: COLORES.bordeCampos,
          hoverBorderColor: '#33415a',
          focusBorderColor: '#7aa1dc',
          invalidBorderColor: '#e05757',
          color: COLORES.textoDestacado,
          disabledColor: COLORES.textoSecundario,
          placeholderColor: COLORES.textoSecundario,
          floatLabelColor: COLORES.textoSecundario,
          floatLabelFocusColor: '#7aa1dc',
          floatLabelActiveColor: COLORES.textoSecundario,
          iconColor: COLORES.textoSecundario,
        },
        overlay: {
          select: { background: COLORES.fondoBarras, borderColor: COLORES.bordeCampos, color: COLORES.texto },
          popover: { background: COLORES.fondoBarras, borderColor: COLORES.bordeCampos, color: COLORES.texto },
          modal: { background: COLORES.fondoBarras, borderColor: COLORES.bordeCampos, color: COLORES.texto },
        },
        list: {
          option: {
            focusBackground: COLORES.fondoCampos,
            selectedBackground: COLORES.filaSeleccionada,
            selectedFocusBackground: '#22385a',
            color: COLORES.texto,
            focusColor: COLORES.textoDestacado,
            selectedColor: COLORES.textoDestacado,
            selectedFocusColor: COLORES.textoDestacado,
          },
        },
        navigation: {
          item: {
            focusBackground: COLORES.fondoCampos,
            activeBackground: COLORES.filaSeleccionada,
            color: COLORES.texto,
            focusColor: COLORES.textoDestacado,
            activeColor: COLORES.textoDestacado,
            icon: { color: COLORES.textoSecundario, focusColor: COLORES.texto, activeColor: COLORES.texto },
          },
        },
      },
    },
  },
});
