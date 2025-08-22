import React, { useState } from 'react';
import validator from 'validator';
import './LoginSignup.css';

const LoginSignup = () => {
    const [isSignup, setIsSignup] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    const [error, setError] = useState('');
    const [emailValid, setEmailValid] = useState(true);
    const [passwordMatch, setPasswordMatch] = useState(true);
    const [passwordStrength, setPasswordStrength] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });

        if (name === 'email') {
            validateEmail(value);
        }

        if (name === 'password') {
            evaluatePasswordStrength(value);
        }

        if (name === 'confirmPassword') {
            validatePasswordMatch(formData.password, value);
        }
    };

    const validateEmail = (email) => {
        setEmailValid(validator.isEmail(email));
    };

    const evaluatePasswordStrength = (password) => {
        const hasLength = password.length >= 8;
        const hasUppercase = /[A-Z]/.test(password);
        const hasLowercase = /[a-z]/.test(password);
        const hasNumber = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*]/.test(password);

        let strengthLevel = 'weak';
        if (hasLength && hasUppercase && hasLowercase && hasNumber && hasSpecialChar) {
            strengthLevel = 'strong';
        } else if (hasLength && (hasUppercase || hasLowercase) && hasNumber) {
            strengthLevel = 'medium';
        }

        setPasswordStrength(strengthLevel);
    };

    const validatePasswordMatch = (password, confirmPassword) => {
        setPasswordMatch(password === confirmPassword);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!emailValid) {
            setError('Invalid email format');
            return;
        }

        if (isSignup && !passwordMatch) {
            setError('Passwords do not match');
            return;
        }

        try {
            const endpoint = isSignup ? 'http://localhost:5000/api/signup' : 'http://localhost:5000/api/login';
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();
            if (data.success) {
                localStorage.setItem('uid', data.uid); // store user id
                console.log(data.uid);
                window.location.href = '/dashboard';
            } else {
                if (isSignup && data.message === 'Email already exists') {
                    setIsSignup(false);
                    setError('Email already exists. Please log in.');
                    setFormData({
                        name: '',
                        email: formData.email,
                        password: '',
                        confirmPassword: ''
                    });
                } else {
                    setError(data.message);
                }
            }
        } catch (err) {
            setError('Server error');
        }
    };

    return (
        <div className="login-signup-page">
            <div className="login-signup-container">
                <div className="toggle-buttons">
                    <button
                        onClick={() => setIsSignup(true)}
                        className={isSignup ? 'active' : ''}
                        type="button"
                    >
                        Signup
                    </button>
                    <button
                        onClick={() => setIsSignup(false)}
                        className={!isSignup ? 'active' : ''}
                        type="button"
                    >
                        Login
                    </button>
                </div>


                <form className="login-signup-form" onSubmit={handleSubmit}>
                    {isSignup && (
                        <input
                            className="login-signup-input"
                            type="text"
                            name="name"
                            placeholder="Name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                        />
                    )}

                    <input
                        className="login-signup-input"
                        type="email"
                        name="email"
                        placeholder="Email"
                        value={formData.email}
                        onChange={handleChange}
                        required
                    />

                    <div className="password-wrapper">
                        <input
                            className="login-signup-input"
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            placeholder="Password"
                            value={formData.password}
                            onChange={handleChange}
                            required
                        />
                        <button
                            type="button"
                            className="show-hide-btn"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            <img src={showPassword ? '/icons/view.webp' : '/icons/hide.webp'} alt="toggle visibility" />
                        </button>
                    </div>

                    {isSignup && (
                        <div className="password-wrapper">
                            <input
                                className="login-signup-input"
                                type={showConfirmPassword ? 'text' : 'password'}
                                name="confirmPassword"
                                placeholder="Confirm Password"
                                value={formData.confirmPassword}
                                onChange={handleChange}
                                required
                            />
                            <button
                                type="button"
                                className="show-hide-btn"
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            >
                                <img src={showConfirmPassword ? '/icons/view.webp' : '/icons/hide.webp'} alt="toggle visibility" />
                            </button>
                        </div>
                    )}

                    <button className="login-signup-submit" type="submit">
                        {isSignup ? 'Signup' : 'Login'}
                    </button>
                </form>

            </div>
        </div>
    );
};

export default LoginSignup;
