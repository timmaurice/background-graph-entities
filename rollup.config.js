import process from 'node:process';
import typescript from '@rollup/plugin-typescript';
import nodeResolve from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { compileString } from 'sass';
import pkg from './package.json' with { type: 'json' };

const dev = process.env.ROLLUP_WATCH;

/**
 * A custom Rollup plugin to compile SCSS to a CSS string.
 * This uses the modern Sass API to avoid deprecation warnings and dependency issues.
 */
const scssToString = () => ({
  name: 'scss-to-string',
  transform(code, id) {
    if (!id.endsWith('.scss')) {
      return null;
    }
    const result = compileString(code, { style: 'compressed' });
    return {
      code: `export default ${JSON.stringify(result.css)};`,
      map: { mappings: '' },
    };
  },
});

export default {
  input: 'src/background-graph-entities.ts',
  output: {
    dir: 'dist',
    format: 'es',
    sourcemap: dev,
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
      delimiters: ['', ''],
      values: {
        __CARD_VERSION__: pkg.version,
      },
    }),
    scssToString(),
    nodeResolve(),
    typescript({
      sourceMap: dev,
      inlineSources: dev,
    }),
  ],
};
