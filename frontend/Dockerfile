FROM nginx:alpine

# Copy frontend files
COPY . /usr/share/nginx/html/

# Copy nginx config (optional)
# COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
