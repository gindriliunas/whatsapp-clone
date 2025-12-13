"use client";
import React, { useEffect, useState } from "react";
import { auth, provider } from "../../firebase";
import { signInWithPopup, signInWithRedirect, getRedirectResult } from "firebase/auth";
import { useRouter } from "next/navigation";
import { useAuthState } from "react-firebase-hooks/auth";
import styled from "styled-components";
import GoogleIcon from "@mui/icons-material/Google";
import { createOrUpdateUser } from "../utils/userUtils";

const LoginContainer = styled.div`
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    background-color: #f0f0f0;
`;

const LoginBox = styled.div`
    background-color: white;
    padding: 40px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    text-align: center;
    min-width: 300px;
`;

const Title = styled.h1`
    color: #007a5a;
    margin-bottom: 10px;
    font-size: 28px;
`;

const Subtitle = styled.p`
    color: #666;
    margin-bottom: 30px;
    font-size: 16px;
`;

const SignInButton = styled.button`
    width: 100%;
    padding: 12px;
    border-radius: 5px;
    background-color: white;
    color: #333;
    border: 1px solid #dadce0;
    font-size: 16px;
    font-weight: 500;
    cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
    transition: all 0.3s;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    opacity: ${props => props.disabled ? 0.6 : 1};

    &:hover:not(:disabled) {
        background-color: #f8f9fa;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.15);
    }

    &:active:not(:disabled) {
        background-color: #f1f3f4;
    }
`;

const LoadingText = styled.p`
    color: #666;
    font-size: 16px;
`;

const WhatsAppLogo = styled.div`
    width: 80px;
    height: 80px;
    margin: 0 auto 20px;
    background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 12px rgba(37, 211, 102, 0.3);
    
    svg {
        width: 50px;
        height: 50px;
        fill: white;
    }
`;

const ErrorMessage = styled.div`
    color: #d32f2f;
    background-color: #ffebee;
    padding: 10px;
    border-radius: 5px;
    margin-bottom: 15px;
    font-size: 14px;
    border-left: 3px solid #d32f2f;
`;

const DebugInfo = styled.div`
    margin-top: 15px;
    color: #999;
    font-size: 12px;
    text-align: center;
`;

export default function Login() {
    const [user, loading] = useAuthState(auth);
    const [signingIn, setSigningIn] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [checkingRedirect, setCheckingRedirect] = useState(true);
    const router = useRouter();

    // Check for redirect result on mount (especially important for mobile)
    useEffect(() => {
        const checkRedirectResult = async () => {
            try {
                console.log("Checking for redirect result...");
                const result = await getRedirectResult(auth);
                if (result && result.user) {
                    console.log("✅ Sign-in via redirect successful:", result.user.email);
                    
                    // Update user document for redirect sign-in
                    try {
                        await createOrUpdateUser(result.user);
                        console.log("User document updated after redirect");
                    } catch (docError) {
                        console.error("Error creating user document after redirect:", docError);
                        // Continue even if document creation fails
                    }
                    
                    // The user state should update automatically via useAuthState
                    // But we'll also trigger navigation explicitly
                    console.log("Redirect sign-in complete, user should be available now");
                } else {
                    console.log("No redirect result found");
                }
            } catch (error) {
                // Only log if it's not a "no redirect pending" error
                if (error.code !== 'auth/no-auth-event' && error.code !== 'auth/popup-closed-by-user') {
                    console.error("Redirect sign-in error:", error);
                    setErrorMessage(`Sign-in error: ${error.message || 'Unknown error'}`);
                } else {
                    console.log("No pending redirect (this is normal)");
                }
            } finally {
                setCheckingRedirect(false);
            }
        };
        
        // Only check redirect result if we're not already signed in
        if (!user && !loading) {
            checkRedirectResult();
        } else {
            setCheckingRedirect(false);
        }
    }, []); // Run only on mount

    // Navigate to home when user is authenticated
    useEffect(() => {
        // Wait for both loading states to complete
        if (!loading && !checkingRedirect && user) {
            console.log("User authenticated, navigating to home...");
            // Create or update user document in Firestore
            createOrUpdateUser(user)
                .then(() => {
                    console.log("User document ready, navigating to home");
                    // Use replace instead of push to avoid back button issues
                    router.replace("/");
                })
                .catch((error) => {
                    console.error("Error creating user document:", error);
                    // Still navigate even if document creation fails
                    router.replace("/");
                });
        }
    }, [user, loading, checkingRedirect, router]);

    const signIn = async () => {
        setSigningIn(true);
        setErrorMessage("");
        
        try {
            // Verify auth is available
            if (!auth) {
                throw new Error("Firebase Auth is not initialized");
            }
            
            // Create a fresh provider instance for this sign-in attempt
            const { GoogleAuthProvider } = await import("firebase/auth");
            const googleProvider = new GoogleAuthProvider();
            googleProvider.setCustomParameters({
                prompt: 'select_account'
            });
            googleProvider.addScope('profile');
            googleProvider.addScope('email');
            
            console.log("Attempting sign-in...");
            console.log("Auth object:", auth);
            console.log("Auth domain:", auth.config?.authDomain);
            
            // Detect mobile devices - use redirect directly for better compatibility
            const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || 
                            (typeof window !== 'undefined' && window.innerWidth <= 768);
            
            if (isMobile) {
                // On mobile, use redirect directly (popups are often blocked)
                console.log("Mobile device detected, using redirect sign-in...");
                try {
                    await signInWithRedirect(auth, googleProvider);
                    // Will redirect away, so we return here
                    // The redirect result will be handled by the useEffect above
                    return;
                } catch (redirectError) {
                    console.error("Redirect sign-in failed:", redirectError);
                    throw redirectError;
                }
            }
            
            // On desktop, try popup first, fallback to redirect
            try {
                console.log("Attempting popup sign-in...");
                const result = await signInWithPopup(auth, googleProvider);
                console.log("✅ Sign-in successful!");
                console.log("User email:", result.user.email);
                console.log("User details:", {
                    email: result.user.email,
                    displayName: result.user.displayName,
                    photoURL: result.user.photoURL,
                    uid: result.user.uid
                });
                
                // Update user document in Firestore
                await createOrUpdateUser(result.user);
                
                // Success - user state will update automatically via useAuthState
            } catch (popupError) {
                console.error("Popup error:", popupError);
                console.error("Error code:", popupError.code);
                
                // If popup is blocked or closed, try redirect
                if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/popup-closed-by-user') {
                    console.log("Popup blocked/closed, trying redirect...");
                    try {
                        await signInWithRedirect(auth, googleProvider);
                        // Will redirect away, so we return here
                        return;
                    } catch (redirectError) {
                        console.error("Redirect also failed:", redirectError);
                        throw redirectError;
                    }
                }
                throw popupError; // Re-throw if it's a different error
            }
        } catch (error) {
            console.error("❌ Sign-in failed!");
            console.error("Full error:", error);
            console.error("Error code:", error?.code);
            console.error("Error message:", error?.message);
            console.error("Error stack:", error?.stack);
            
            // Handle specific error cases
            let message = "An error occurred during sign-in.";
            
            if (error?.code === 'auth/popup-closed-by-user') {
                message = "Sign-in was cancelled. Please try again.";
            } else if (error?.code === 'auth/popup-blocked') {
                message = "Popup was blocked. Please allow popups and try again, or the page will redirect automatically.";
            } else if (error?.code === 'auth/network-request-failed') {
                message = "Network error. Please check your internet connection and try again.";
            } else if (error?.code === 'auth/unauthorized-domain') {
                message = "This domain is not authorized. Please add 'localhost' to authorized domains in Firebase Console > Authentication > Settings > Authorized domains.";
            } else if (error?.code === 'auth/operation-not-allowed') {
                message = "Google sign-in is not enabled. Please enable it in Firebase Console > Authentication > Sign-in method.";
            } else if (error?.code === 'auth/configuration-not-found') {
                message = "Firebase configuration error. Please check your Firebase setup.";
            } else if (error?.code === 'auth/invalid-api-key') {
                message = "Invalid API key. Please check your Firebase configuration.";
            } else if (error?.message) {
                message = `Error: ${error.message}`;
            }
            
            setErrorMessage(message);
            alert(message);
        } finally {
            setSigningIn(false);
        }
    };

    // Show loading while checking auth state or redirect result
    if (loading || checkingRedirect) {
        return (
            <LoginContainer>
                <LoginBox>
                    <LoadingText>Loading...</LoadingText>
                </LoginBox>
            </LoginContainer>
        );
    }
    
    // If user is authenticated, don't show login screen (navigation will happen via useEffect)
    if (user) {
        return (
            <LoginContainer>
                <LoginBox>
                    <LoadingText>Signing you in...</LoadingText>
                </LoginBox>
            </LoginContainer>
        );
    }

    return (
        <LoginContainer>
            <LoginBox>
                <WhatsAppLogo>
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                    </svg>
                </WhatsAppLogo>
                <Title>WhatsApp 2.0</Title>
                <Subtitle>Sign in to continue</Subtitle>
                {errorMessage && (
                    <ErrorMessage>{errorMessage}</ErrorMessage>
                )}
                <SignInButton onClick={signIn} disabled={signingIn || loading}>
                    <GoogleIcon style={{ fontSize: 20 }} />
                    {signingIn ? "Signing in..." : "Sign in with Google"}
                </SignInButton>
                <DebugInfo>
                    <small>Check browser console (F12) for detailed error messages</small>
                </DebugInfo>
            </LoginBox>
        </LoginContainer>
    );
}
