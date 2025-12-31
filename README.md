<div align="center">

# 🖨️ EmojiCut AI - 可爱贴纸打印机

**使用神秘贴纸生成器一键生成 LINE 风格贴纸表情包**

![Cute Sticker Printer](https://img.shields.io/badge/AI-Qwen%20%2F%20Wanxian-blue?style=for-the-badge)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript)

</div>

---

## ✨ 功能特点

- 🎨 **AI 一键生成** - 上传角色图片，自动生成 16 张可爱贴纸
- 🎀 **自定义风格** - 支持输入任意画面风格（赛博朋克、水彩风、像素艺术等）
- ✂️ **智能切图** - 自动识别并切分贴纸，生成独立 PNG
- 📦 **批量下载** - 一键打包下载所有贴纸为 ZIP
- 🖨️ **可爱 UI** - 粉色系贴纸打印机界面，贴纸动画"吐出"效果
- 🌏 **国产模型** - 全面切换至阿里云通义千问（Qwen）与通义万相（Wanxian）模型

## 🚀 快速开始

### 环境要求

- Node.js 18+
- 阿里云 DashScope API Key (开通通义千问/通义万相权限)

### 安装运行

```bash
# 克隆项目
git clone https://github.com/Left2y/emojicut-qwen.git
cd emojicut-qwen

# 安装依赖
npm install

# 配置 API Key
# 在项目根目录创建 .env.local 文件，并设置:
# DASHSCOPE_API_KEY=你的阿里云_API_Key

# 启动开发服务器
npm run dev
```

访问 http://localhost:3002 开始使用！

## 📖 使用说明

1. **上传图片** - 点击打印机屏幕上传角色参考图
2. **输入风格** - 在输入框描述想要的画面风格（可选）
3. **生成贴纸** - 点击"生成贴纸"按钮，等待 AI (Qwen + Wanxian) 生成
4. **自动切图** - 生成完成后自动进入切图模式
5. **下载保存** - 点击"全部保存"下载 ZIP 包

## 🛠️ 技术栈

| 技术 | 说明 |
|------|------|
| **Qwen-VL-Max** | 图像视觉理解与特征提取 |
| **Wanxian-T2I** | 通义万相文生图模型 |
| **Qwen-VL-Plus** | 贴纸自动命名 |
| **React 19** | 前端框架 |
| **TypeScript** | 类型安全 |
| **Vite** | 构建工具 (含 API 代理) |
| **JSZip** | 打包下载 |

## 📁 项目结构

```
emoji-cut/
├── App.tsx              # 主应用组件
├── components/
│   ├── CutePrinter2D.tsx   # 可爱打印机 UI（含 AI 生成）
│   ├── StickerStack.tsx    # 贴纸堆叠展示
│   └── ManualCropModal.tsx # 手动裁剪弹窗
├── services/
│   ├── qwenService.ts      # 通义千问/万相 API 调用 (New!)
│   ├── geminiService.ts    # (Legacy) Gemini API 调用
│   └── imageProcessor.ts   # 图片切割处理
├── shojo.css            # 可爱风格样式
└── types.ts             # TypeScript 类型定义
```

## 🎨 预设风格

- 🌸 可爱 LINE 贴纸
- 😆 Q版表情包
- 🎀 粉彩少女风
- ⚡ 动感活力风

也可以自定义输入任意风格描述！

## 📄 License

MIT License

---

<div align="center">

Made with 💕 using Gemini AI

</div>
