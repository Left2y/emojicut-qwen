import React, { useState } from 'react';
import { analyzeImageFeatures, testImageGeneration } from '../services/qwenService';

// Use a stable public image URL for testing (Alibaba Cloud Demo Image)
const TEST_IMAGE_URL = "https://dashscope.oss-cn-beijing.aliyuncs.com/images/dog_and_girl.jpeg";

const ApiTester: React.FC = () => {
    const [logs, setLogs] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    const addLog = (msg: string | object) => {
        const text = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg;
        setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${text}`, ...prev]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target?.result as string;
                setSelectedImage(base64);
                addLog(`📂 Image loaded: ${file.name} (${Math.round(base64.length / 1024)} KB)`);
            };
            reader.readAsDataURL(file);
        }
    };

    const testVision = async () => {
        setLoading(true);
        // If user uploaded an image, use it (Base64). Otherwise use public URL.
        const imageToUse = selectedImage || TEST_IMAGE_URL;
        addLog(`🚀 Testing Qwen-VL (Vision) with ${selectedImage ? "Uploaded Image" : "Public Demo URL"}...`);
        
        try {
            const result = await analyzeImageFeatures(imageToUse);
            addLog("✅ Vision Success!");
            addLog(`Result: ${result}`);
        } catch (e: any) {
            addLog("❌ Vision Failed");
            addLog(e.message || e);
        } finally {
            setLoading(false);
        }
    };

    const testGeneration = async () => {
        setLoading(true);
        addLog("🚀 Testing Qwen-Image (Generation)...");
        try {
            const rawResponse = await testImageGeneration("一只可爱的卡通小猫");
            addLog("📡 Raw API Response:");
            addLog(rawResponse);

            if (rawResponse.output?.results?.[0]?.url) {
                addLog("✅ Generation Success! URL found.");
            } else {
                // Check for the choices structure (OpenAI compatible)
                 if (rawResponse.output?.choices?.[0]?.message?.content?.[0]?.image) {
                    addLog("✅ Generation Success! Image found in 'choices' structure.");
                 } else {
                    addLog("⚠️ Response received but format unexpected.");
                 }
            }
        } catch (e: any) {
            addLog("❌ Generation Failed");
            addLog(e.message || e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed top-0 left-0 w-full h-full bg-white z-[100] p-8 overflow-auto flex flex-col gap-4">
            <h1 className="text-2xl font-bold mb-4 text-gray-800">🛠️ API Connection Tester</h1>
            
            <div className="flex flex-col gap-4 border p-4 rounded bg-gray-50">
                <label className="font-bold">Step 1: Upload Test Image (Optional)</label>
                <input type="file" onChange={handleFileChange} className="block w-full text-sm text-slate-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-violet-50 file:text-violet-700
                    hover:file:bg-violet-100" />
                {selectedImage && <img src={selectedImage} alt="Preview" className="h-24 w-24 object-cover rounded border" />}
            </div>

            <div className="flex gap-4">
                <button 
                    onClick={testVision} 
                    disabled={loading}
                    className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 font-bold"
                >
                    Test 1: Vision (Qwen-VL)
                </button>

                <button 
                    onClick={testGeneration} 
                    disabled={loading}
                    className="px-6 py-3 bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 font-bold"
                >
                    Test 2: Generation (Qwen-Image)
                </button>
                
                <button 
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                    Close / Reload App
                </button>
            </div>

            <div className="flex-1 bg-gray-900 text-green-400 p-4 rounded-xl font-mono text-sm whitespace-pre-wrap overflow-auto shadow-inner border border-gray-700">
                {logs.length === 0 ? "Ready to test. Click a button above." : logs.join('\n\n')}
            </div>
        </div>
    );
};

export default ApiTester;
