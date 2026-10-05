import { FlatCompat } from '@eslint/eslintrc';
const compatibility = new FlatCompat({ baseDirectory: import.meta.dirname });
const eslintConfig = [
    { ignores: ['node_modules/**', '.next/**', '.next-dev/**', 'data/**', 'artifacts/**', 'out/**'] },
    ...compatibility.extends('next/core-web-vitals'),
    {
        files: ['**/*.{js,jsx,mjs}'],
        rules: {
            indent: ['error', 4, { SwitchCase: 1 }],
            'react/jsx-max-props-per-line': ['error', {
                maximum: 1,
                when: 'always',
            }],
            'react/jsx-one-expression-per-line': ['error', { allow: 'none' }],
            'react/jsx-first-prop-new-line': ['error', 'multiline-multiprop'],
            'react/jsx-tag-spacing': ['error', { beforeSelfClosing: 'always' }],
            'react/jsx-curly-spacing': ['error', { when: 'never' }],
            semi: ['error', 'always'],
            quotes: ['error', 'single', {
                avoidEscape: true,
                allowTemplateLiterals: true,
            }],
            'comma-dangle': ['error', 'always-multiline'],
            'object-curly-spacing': ['error', 'always'],
            'object-curly-newline': ['error', {
                ObjectExpression: {
                    multiline: true,
                    minProperties: 3,
                },
                ObjectPattern: {
                    multiline: true,
                    minProperties: 6,
                },
                ImportDeclaration: 'never',
                ExportDeclaration: 'never',
            }],
            'object-property-newline': ['error', { allowAllPropertiesOnSameLine: false }],
            'array-bracket-spacing': ['error', 'never'],
            'key-spacing': 'error',
            'keyword-spacing': 'error',
            'space-infix-ops': 'error',
            'space-before-blocks': 'error',
            'space-before-function-paren': ['error', {
                anonymous: 'always',
                named: 'never',
                asyncArrow: 'always',
            }],
            'arrow-spacing': 'error',
            curly: ['error', 'all'],
            'brace-style': ['error', '1tbs', { allowSingleLine: false }],
            'no-multiple-empty-lines': ['error', {
                max: 1,
                maxEOF: 0,
            }],
            'no-trailing-spaces': 'error',
            'eol-last': ['error', 'always'],
            'no-var': 'error',
            'prefer-const': 'error',
            'one-var': ['error', 'never'],
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
            }],
            'react/no-unescaped-entities': 'off',
            '@next/next/no-img-element': 'off',
        },
    },
];
export default eslintConfig;
