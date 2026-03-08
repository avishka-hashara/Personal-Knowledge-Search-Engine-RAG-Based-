FROM node:20

WORKDIR /app

# COPY package.json and package-lock.json for reliable builds
COPY package.json package-lock.json* ./

# Install dependencies using the lockfile
RUN npm install

# Re-install the specific Linux binary for Tailwind 4 inside the container
RUN npm install @tailwindcss/oxide-linux-x64-gnu

COPY . .

# Match the port we are actually using
EXPOSE 3040

CMD ["npm", "run", "dev"]