import React, { useState, useRef, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { FaSpinner } from "react-icons/fa";

function App() {
  const webcamRef = useRef(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [caption, setCaption] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState("");
  const [isListening, setIsListening] = useState(true);
  const [hasWelcomed, setHasWelcomed] = useState(false);
  const captureIntervalRef = useRef(null);
  const recognitionRef = useRef(null);

  const captureImage = useCallback(async () => {
    if (webcamRef.current) {
      const imageSrc = webcamRef.current.getScreenshot();
      if (imageSrc) {
        try {
          setIsLoading(true);
          const base64 = imageSrc.split(',')[1];
  
          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": "Bearer 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",
              "HTTP-Referer": window.location.origin, 
              "X-Title": "VisionaryAI"
            },
            body: JSON.stringify({
              model: "meta-llama/llama-4-maverick:free",
              messages: [
                {
                  role: "system",
                  content: "Consider yourself as an assistant for a blind man and you are here to help him see the world in front of him so describe the image in a single sentence make it crisp concise and accurate. Make sure the answer is right and make sure not to exceed it over a sentence. Very very important instruction make it short and less than a sentence and less than one Make it crisp and importantly - concise",
                },
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: "Describe the image in one short sentence.",
                    },
                    {
                      type: "image_url",
                      image_url: {
                        url: `data:image/jpeg;base64,${base64}`,
                      },
                    },
                  ],
                },
              ],
              max_tokens: 100,
              temperature: 0.7,
              stream: false,
              data_policy: {
                allow_prompt_training: true,
                allow_response_training: true
              }
            }),
          });
  
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || "API request failed");
          }
          
          const data = await response.json();
          const reply = data?.choices?.[0]?.message?.content?.trim();
  
          if (reply) {
            setCaption(reply);
            if (!isMuted) {
              speakText(reply);
            }
          } else {
            const errorMessage = "Could not describe the scene. Please try again.";
            setCaption(errorMessage);
            if (!isMuted) {
              speakText(errorMessage);
            }
          }
        } catch (err) {
          console.error("Error processing image:", err);
          const errorMessage = `Error: ${err.message || "Failed to process image"}`;
          setCaption(errorMessage);
          if (!isMuted) {
            speakText("Error processing image. Please try again.");
          }
          setError(errorMessage);
        } finally {
          setIsLoading(false);
        }
      }
    }
  }, [isMuted]);
  
  const speakText = (text) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(utterance);
    }
  };

  const startCapturing = useCallback(() => {
    if (!isCapturing) {
      if (!hasWelcomed) {
        speakText(
          "Welcome to VisionaryAI. Now describing your surroundings."
        );
        setHasWelcomed(true);
      } else {
        speakText(
          "Camera opened. Now describing your surroundings."
        );
      }
      setIsCapturing(true);
    }
  }, [isCapturing, hasWelcomed]);

  const stopCapturing = useCallback(() => {
    if (isCapturing) {
      speakText("Camera closed. Stopped describing.");
  
      // Stop interval
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
  
      // Stop the webcam stream manually
      const webcam = webcamRef.current;
      if (webcam && webcam.video && webcam.video.srcObject) {
        const tracks = webcam.video.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
  
      setIsCapturing(false);
    }
  }, [isCapturing]);
  
  const toggleMute = () => {
    setIsMuted((prevMuted) => {
      const newMuted = !prevMuted;
      speakText(newMuted ? "Audio disabled" : "Audio enabled");
      return newMuted;
    });
  };

  const isSpeechRecognitionAvailable = () => {
    return "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  };

  const initSpeechRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error("Error stopping speech recognition:", e);
      }
      recognitionRef.current = null;
    }

    if (!isSpeechRecognitionAvailable()) {
      speakText("Speech recognition is not supported in this browser.");
      return false;
    }

    try {
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = "en-US";

      recognitionRef.current.onresult = (event) => {
        // Cancel any ongoing speech synthesis immediately
        window.speechSynthesis.cancel();
        const transcript = event.results[event.results.length - 1][0].transcript
          .trim()
          .toLowerCase();

        if (
          transcript.includes("open camera") ||
          transcript.includes("start camera")
        ) {
          startCapturing();
        } else if (
          transcript.includes("close camera") ||
          transcript.includes("stop camera")
        ) {
          stopCapturing();
        } else if (transcript.includes("mute audio")) {
          if (!isMuted) toggleMute();
        } else if (transcript.includes("unmute audio")) {
          if (isMuted) toggleMute();
        } else if (transcript.includes("start") || transcript.includes("describe")) {
          if (isCapturing) {
            speakText("Describing now...");
            captureImage();
          } else {
            speakText("Please open the camera first.");
          }
        }
      };

      recognitionRef.current.onerror = (event) => {
        if (
          event.error === "not-allowed" ||
          event.error === "service-not-allowed"
        ) {
          speakText(
            "Microphone access denied. Please allow microphone access."
          );
          setIsListening(false);
        }
      };

      recognitionRef.current.onend = () => {
        if (isListening) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.error("Error restarting speech recognition:", e);
            setTimeout(() => {
              try {
                recognitionRef.current?.start();
              } catch (err) {
                console.error("Failed to restart speech recognition:", err);
              }
            }, 7000);
          }
        }
      };

      return true;
    } catch (err) {
      console.error("Speech recognition initialization error:", err);
      speakText("Failed to initialize speech recognition.");
      return false;
    }
  }, [isListening, isMuted, startCapturing, stopCapturing, captureImage]);

  useEffect(() => {
    if (!isSpeechRecognitionAvailable()) {
      speakText(
        "This browser does not support speech recognition. Please use Chrome or Edge."
      );
      return;
    }

    const initialized = initSpeechRecognition();
    if (initialized) {
      try {
        recognitionRef.current.start();
        speakText('VisionaryAI ready. Say "open camera" to begin.');
      } catch (err) {
        console.error("Failed to start voice commands:", err);
        speakText("Failed to start voice commands. Please reload the page.");
      }
    }

    // Cleanup function
    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.error("Error stopping recognition during cleanup:", e);
        }
      }
    };
  }, [initSpeechRecognition]);

  useEffect(() => {
    if (isCapturing) {
      // Immediate capture when camera is first opened
      captureImage();
      
      // Set up interval for periodic captures
      captureIntervalRef.current = setInterval(captureImage, 7000);
      
      // Cleanup for this specific effect
      return () => {
        if (captureIntervalRef.current) {
          clearInterval(captureIntervalRef.current);
          captureIntervalRef.current = null;
        }
      };
    }
  }, [isCapturing, captureImage]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <header className="p-4 text-center border-b border-gray-700">
        <h1 className="text-xl font-bold">VisionaryAI</h1>
        <p className="text-sm text-gray-300">
          {isListening ? "Voice commands active" : "Voice commands disabled"}
          {" | "}
          {isMuted ? "Audio muted" : "Audio enabled"}
        </p>
      </header>

      {/* Main content: Camera centered */}
      <main className="flex-grow flex items-center justify-center p-4">
        {isCapturing ? (
          <div className="relative w-full max-w-lg">
            <Webcam
              audio={false}
              ref={webcamRef}
              screenshotFormat="image/jpeg"
              className="w-full rounded-md shadow-lg"
              videoConstraints={{ 
                facingMode: "environment",
                width: 640,
                height: 480
              }}
            />
            {isLoading && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                <FaSpinner className="animate-spin h-12 w-12" />
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-8 bg-gray-800 rounded-lg">
            <p>Camera inactive. Say "open camera" to start.</p>
            <button 
              onClick={startCapturing}
              className="mt-4 px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
            >
              Start Camera
            </button>
          </div>
        )}
      </main>

      {/* Footer: Caption text at the bottom */}
      <footer className="p-4 text-center border-t border-gray-700">
        <div className="bg-gray-800 p-3 rounded-md">
          <p className="text-lg font-medium">{caption || "Waiting for image analysis..."}</p>
          {error && <p className="text-red-400 mt-2 text-sm">{error}</p>}
        </div>
        
        <div className="mt-4 flex justify-center space-x-4">
          {isCapturing ? (
            <button 
              onClick={stopCapturing}
              className="px-3 py-1 bg-red-600 rounded hover:bg-red-700"
            >
              Stop Camera
            </button>
          ) : (
            <button 
              onClick={startCapturing}
              className="px-3 py-1 bg-blue-600 rounded hover:bg-blue-700"
            >
              Start Camera
            </button>
          )}
          
          {isCapturing && (
            <button 
              onClick={captureImage}
              className="px-3 py-1 bg-purple-600 rounded hover:bg-purple-700"
              disabled={isLoading}
            >
              Describe Now
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}

export default App;