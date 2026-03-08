FROM node:20

WORKDIR /app

# COPY ONLY package.json (Leave package-lock.json behind!)
COPY package.json ./

# Run a fresh install so Linux grabs its own native Tailwind binaries
RUN npm install && npm install @tailwindcss/oxide-linux-x64-gnu

COPY . .

# Match the port we are actually using
EXPOSE 3040

CMD ["npm", "run", "dev"]