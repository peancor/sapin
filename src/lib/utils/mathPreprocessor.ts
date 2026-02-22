/**
 * Preprocesses text to properly format math expressions for markedKatex
 * Handles various math delimiters and ensures they are properly formatted for rendering
 */
export function preprocessMathExpressions(content: string): string {
  if (!content) return '';
  
  let processed = content;
  
  // Paso 1: Preservar los bloques de código para no procesarlos
  const codeBlocks: string[] = [];
  processed = processed.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  
  // Paso 2: Preservar los bloques inline code
  const inlineCodeBlocks: string[] = [];
  processed = processed.replace(/`[^`]+`/g, (match) => {
    inlineCodeBlocks.push(match);
    return `__INLINE_CODE_${inlineCodeBlocks.length - 1}__`;
  });
  
  // Paso 3: Procesar bloques de matemáticas ($$...$$)
  // Asegurarse de que hay espacios adecuados alrededor
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (match, p1) => {
    // Asegurarse de que el contenido está bien formateado
    const trimmed = p1.trim();
    return `\n\n$$${trimmed}$$\n\n`;
  });
  
  // Paso 4: Procesar expresiones matemáticas inline con \( \)
  processed = processed.replace(/\\\((.*?)\\\)/g, (match, p1) => {
    return `$${p1.trim()}$`;
  });
  
  // Paso 5: Procesar expresiones matemáticas de bloque con \[ \]
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (match, p1) => {
    return `\n\n$$${p1.trim()}$$\n\n`;
  });
  
  // Paso 6: Procesar expresiones matemáticas inline con $ $
  // Usamos una expresión regular más precisa para evitar confusiones con símbolos de moneda
  processed = processed.replace(/\$([^$\n]+?)\$/g, (match, p1) => {
    // Verificar que no es un símbolo de moneda (contexto típico)
    if (!/^\s*\d+/.test(p1) && !/\d+\s*$/.test(p1)) {
      return `$${p1.trim()}$`;
    }
    return match; // Devolver sin cambios si parece un símbolo de moneda
  });
  
  // Paso 7: Restaurar los bloques de código
  codeBlocks.forEach((block, index) => {
    processed = processed.replace(`__CODE_BLOCK_${index}__`, block);
  });
  
  // Paso 8: Restaurar los bloques inline code
  inlineCodeBlocks.forEach((block, index) => {
    processed = processed.replace(`__INLINE_CODE_${index}__`, block);
  });
  
  return processed;
} 