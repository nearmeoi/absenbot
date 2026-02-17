/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: { primary: "#0df259" },
            boxShadow: { neo: "4px 4px 0 #000" },
            fontFamily: {
              poppins: ['"Poppins"', 'sans-serif'],
            }
        }
    },
    plugins: [],
}
