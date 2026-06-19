import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export const useVoiceSearch = (onResult, onError) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const recognitionRef = useRef(null);
    const isStartingRef = useRef(false);
    const silenceTimeoutRef = useRef(null);
    const latestTranscriptRef = useRef('');

    // Keep dynamic callback and state in refs to keep startListening stable
    const onResultRef = useRef(onResult);
    onResultRef.current = onResult;

    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const isListeningRef = useRef(false);
    isListeningRef.current = isListening;

    const stopListening = useCallback(() => {
        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }
        if (recognitionRef.current) {
            try {
                recognitionRef.current.onstart = null;
                recognitionRef.current.onaudiostart = null;
                recognitionRef.current.onsoundstart = null;
                recognitionRef.current.onspeechstart = null;
                recognitionRef.current.onspeechend = null;
                recognitionRef.current.onsoundend = null;
                recognitionRef.current.onaudioend = null;
                recognitionRef.current.onresult = null;
                recognitionRef.current.onerror = null;
                recognitionRef.current.onend = null;
                recognitionRef.current.stop();
            } catch (e) {
                // Ignore errors on stop
            }
            recognitionRef.current = null;
        }
        setIsListening(false);
        isStartingRef.current = false;
    }, []);

    const startListening = useCallback(() => {
        if (isListeningRef.current || isStartingRef.current) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            toast.error("Voice search is not supported in this browser.");
            return;
        }

        try {
            isStartingRef.current = true;
            latestTranscriptRef.current = '';
            setTranscript('');
            
            const recognition = new SpeechRecognition();
            recognition.lang = 'en-IN';
            recognition.continuous = false;
            recognition.interimResults = true; // Use interim results to work around WebView delays
            recognition.maxAlternatives = 1;

            const handleSpeechEnd = () => {
                const finalResult = latestTranscriptRef.current.trim();
                if (finalResult && onResultRef.current) {
                    onResultRef.current(finalResult);
                }
                stopListening();
            };

            recognition.onstart = () => {
                console.log('Speech recognition started');
                setIsListening(true);
                isStartingRef.current = false;
            };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const transcriptText = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalTranscript += transcriptText;
                    } else {
                        interimTranscript += transcriptText;
                    }
                }

                const currentText = finalTranscript || interimTranscript;
                console.log('Speech recognition result:', { currentText, isFinal: !!finalTranscript });
                
                if (currentText.trim()) {
                    latestTranscriptRef.current = currentText;
                    setTranscript(currentText.trim());
                }

                if (finalTranscript.trim()) {
                    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
                    handleSpeechEnd();
                } else {
                    if (silenceTimeoutRef.current) clearTimeout(silenceTimeoutRef.current);
                    silenceTimeoutRef.current = setTimeout(() => {
                        console.log('Speech recognition silence timeout reached, committing result:', latestTranscriptRef.current);
                        handleSpeechEnd();
                    }, 1500); // 1.5 seconds of silence auto-commits the interim result
                }
            };

            recognition.onerror = (event) => {
                const errorType = event.error;
                console.error('Speech recognition error:', errorType);
                
                if (errorType === 'not-allowed') {
                    toast.error("Microphone access denied.", { duration: 3000 });
                } else if (errorType === 'no-speech') {
                    toast.error("No speech detected. Please try again.", { duration: 3000 });
                } else if (errorType === 'network') {
                    toast.error("Network error during voice search.", { duration: 3000 });
                }
                
                if (onErrorRef.current) {
                    onErrorRef.current(errorType);
                }
                stopListening();
            };

            recognition.onend = () => {
                console.log('Speech recognition ended');
                // If we ended but have some speech captured, process it
                if (latestTranscriptRef.current.trim()) {
                    handleSpeechEnd();
                } else {
                    if (onErrorRef.current) {
                        onErrorRef.current('no-speech');
                    }
                    stopListening();
                }
            };

            // Optional diagnostic events
            recognition.onspeechstart = () => console.log('Speech detected');
            recognition.onspeechend = () => console.log('Speech ended');

            recognitionRef.current = recognition;
            recognition.start();
        } catch (error) {
            isStartingRef.current = false;
            console.error('Speech recognition initialization failed:', error);
        }
    }, [stopListening]);

    return {
        isListening,
        transcript,
        startListening,
        stopListening
    };
};
