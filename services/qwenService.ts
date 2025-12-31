import { StickerStyle, STICKER_STYLES } from './geminiService';
export { STICKER_STYLES };

// 阿里云 DashScope API 基础配置
const API_KEY = process.env.DASHSCOPE_API_KEY || process.env.VITE_DASHSCOPE_API_KEY || '';
// 使用本地代理路径以避免 CORS 问题
const BASE_URL = '/api/dashscope';

interface DashScopeResponse {
  output?: {
    text?: string;
    task_id?: string;
    task_status?: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
    results?: Array<{ url: string }>;
    choices?: Array<{
      message?: {
        content?: Array<{
          image?: string;
          text?: string;
        }>;
      };
    }>;
  };
  usage?: any;
  request_id?: string;
  code?: string;
  message?: string;
}

/**
 * 辅助函数：将 URL 转换为 Base64
 */
const fetchAsBase64 = async (url: string): Promise<string> => {
  const imgRes = await fetch(url);
  const blob = await imgRes.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * 第一步：使用 Qwen-VL 分析参考图特征
 */
export const analyzeImageFeatures = async (imageInput: string): Promise<string> => {
  let imageContent = imageInput;
  if (!imageInput.startsWith('http') && !imageInput.startsWith('data:')) {
    imageContent = `data:image/png;base64,${imageInput}`;
  }

  const body = {
    model: 'qwen3-vl-plus',
    input: {
      messages: [
        {
          role: 'user',
          content: [
            { image: imageContent },
            { text: "详细描述图中角色的外观特征，包括发型、发色、眼睛、服装细节、配饰和典型表情。请用简洁的中文描述，不要包含背景信息。" }
          ]
        }
      ]
    },
    parameters: {
      max_tokens: 200
    }
  };

  const response = await fetch(`${BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("Qwen Analysis Error Detail:", err);
    throw new Error(err.message || `API Error: ${response.status}`);
  }
  const data = await response.json();
  
  // 兼容两种返回结构
  let text = data.output?.text;
  if (!text && data.output?.choices?.[0]?.message?.content?.[0]?.text) {
    text = data.output.choices[0].message.content[0].text;
  }
  
  return text || "一个可爱的卡通角色";
};

/**
 * 主函数：生成贴纸
 */
export const generateStickerSheet = async (
  referenceImage: string,
  style: StickerStyle,
  customStyle?: string
): Promise<string> => {
  try {
    // 1. 分析参考图
    console.log("正在使用 Qwen-VL 分析图片...");
    const characterDescription = await analyzeImageFeatures(referenceImage);
    console.log("角色特征:", characterDescription);

    // 2. 构建提示词
    const styleDesc = customStyle?.trim() || style.description;
    const prompt = `一张包含16个不同表情和动作的贴纸及其排版图。角色特征：${characterDescription}。风格要求：${styleDesc}，${style.name}。排版要求：整齐排列在纯白背景上，角色比例为二头身Q版，每个表情独立，之间有留白。画质要求：高品质，矢量图风格，线条清晰，色彩鲜艳。背景：纯白色(#FFFFFF)，无水印，无文字。`;

    // 3. 调用 wan2.6-image 生成贴纸
    // 该模型需要参考图输入 (Image-to-Image)
    console.log("正在调用 wan2.6-image 生成贴纸...");
    
    // 确保图片有正确的前缀
    const inputImage = referenceImage.startsWith('data:') 
        ? referenceImage 
        : `data:image/png;base64,${referenceImage}`;

    const body = {
      model: 'wan2.6-image',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: inputImage },
              { text: prompt }
            ]
          }
        ]
      },
      parameters: {
        negative_prompt: "低分辨率，低画质，肢体畸形，手指畸形，画面过饱和，蜡像感，人脸无细节，过度光滑，画面具有AI感。构图混乱。文字模糊，扭曲。",
        prompt_extend: true,
        watermark: false,
        size: "1024*1024"
      }
    };

    const response = await fetch(`${BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || `API Error: ${response.status}`);
    }

    const data = await response.json();
    console.log("[Gen Response Raw]", JSON.stringify(data, null, 2));
    
    const imageUrl = data.output?.choices?.[0]?.message?.content?.[0]?.image;
    
    if (imageUrl) {
        return await fetchAsBase64(imageUrl);
    }
    
    throw new Error("No image URL returned in response choices.");

  } catch (error) {
    console.error("Qwen Service Error:", error);
    throw error;
  }
};

/**
 * 贴纸命名
 */
export const generateStickerName = async (base64Image: string): Promise<string> => {
  try {
    let imageContent = base64Image;
    if (!base64Image.startsWith('data:')) {
      imageContent = `data:image/png;base64,${base64Image}`;
    }

    const body = {
      model: 'qwen3-vl-plus',
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { image: imageContent },
              { text: "Output a JSON object with a 'filename' property containing a short, descriptive name (max 3 words) in English using snake_case. Example: 'sad_crying'. Only output JSON." }
            ]
          }
        ]
      }
    };

    const response = await fetch(`${BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) throw new Error("Naming failed");

    const data = await response.json();
    let text = data.output?.text;
    if (!text && data.output?.choices?.[0]?.message?.content?.[0]?.text) {
        text = data.output.choices[0].message.content[0].text;
    }

    text = (text || "").replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const json = JSON.parse(text);
      return json.filename || "sticker";
    } catch (e) {
      return text.split(' ')[0].toLowerCase() || "sticker";
    }

  } catch (error) {
    console.error("Qwen Naming Error:", error);
    return "sticker";
  }
};

/**
 * 单独测试生图 API (Debug Use)
 */
export const testImageGeneration = async (prompt: string): Promise<any> => {
    const body = {
      model: 'qwen-image-max',
      input: {
        messages: [{ role: 'user', content: [{ text: prompt }] }]
      },
      parameters: { size: "1024*1024", n: 1 }
    };

    const response = await fetch(`${BASE_URL}/api/v1/services/aigc/multimodal-generation/generation`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    return await response.json();
};