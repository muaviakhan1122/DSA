# Use an official Node.js Debian-based image
FROM node:20-bookworm

# Install the modern GNU C++ Compiler (g++) for C++23 support
RUN apt-get update && apt-get install -y g++

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of your application code
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the server
CMD ["npm", "start"]