# 使用轻量级 Node 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制依赖定义
COPY package*.json ./

# 安装所有依赖
RUN npm install

# 复制源代码
COPY . .

# 构建 React 项目 (生成 dist 目录)
RUN npm run build

# 暴露端口
EXPOSE 3002

# 启动我们写的 server.js
CMD ["node", "server.js"]
