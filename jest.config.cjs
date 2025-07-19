module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    transform: {
        "^.+\\.(js|jsx)$": "babel-jest"
    },
    testMatch: [
        '**/?(*.)(spec|test).ts',
    ],
};
