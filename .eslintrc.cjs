module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    extends: [
        'plugin:@typescript-eslint/recommended',
    ],
    plugins: [
        '@typescript-eslint',
    ],
    parserOptions: {
        ecmaVersion: 2017,
        sourceType: 'module',
        project: './tsconfig.json',
    },
    rules: {
        '@typescript-eslint/indent': ['error', 4],
        '@typescript-eslint/no-shadow': 'off',
        '@typescript-eslint/no-use-before-define': 'off',
        '@typescript-eslint/no-loop-func': 'off',
        'import/prefer-default-export': 'off',
        'max-len': 'off',
        'no-plusplus': 'off',
        'no-restricted-syntax': 'off',
        'no-else-return': 'off',
        'no-multi-assign': 'off',
        'no-constant-condition': 'off',
        'no-continue': 'off',
        'import/no-extraneous-dependencies': 'off',
        'max-classes-per-file': 'off',
    },
};
