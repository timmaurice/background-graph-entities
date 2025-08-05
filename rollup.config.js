import process from 'node:process';
import path from 'node:path';
import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import json from '@rollup/plugin-json';
import replace from '@rollup/plugin-replace';
import { compile } from 'sass';
import litCss from 'rollup-plugin-lit-css';
import pkg from './package.json' with { type: 'json' };

const dev = process.env.ROLLUP_WATCH === 'true';

export default {
  input: 'src/background-graph-entities.ts',
  output: {
    file: pkg.main,
    format: 'es',
    sourcemap: dev,
    inlineDynamicImports: true,
  },
  onwarn(warning, warn) {
    if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('d3-')) {
      return;
    }
    warn(warning);
  },
  plugins: [
    replace({
      preventAssignment: true,
      values: {
        v__CARD_VERSION__: pkg.version,
      },
    }),
    nodeResolve(),
    litCss({
      include: ['**/*.scss'],
      transform: (data, { filePath }) => {
        const result = compile(filePath, {
          style: dev ? 'expanded' : 'compressed',
          loadPaths: [path.dirname(filePath)],
        });
        return result.css.toString();
      },
    }),
    json({ compact: true }),
    typescript({
      sourceMap: dev,
      inlineSources: dev,
    }),
  ],
};
