FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application files
COPY . .

# Expose API port
EXPOSE 3000

# Start server
CMD ["npm", "run", "dev"]
