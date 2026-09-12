// 화면 후처리 (내장 렌더 파이프라인용)
// Pass 0: 블룸 밝기 추출   Pass 1: 가우시안 블러
// Pass 2: SSAO (카메라 DepthNormals)   Pass 3: 깊이 인식 AO 블러
// Pass 4: 합성 (블룸 + AO + 노출 + 화이트밸런스 + ACES + 리프트/감마/게인 + 스플릿 토닝 + 채도/대비 + 비네트 + 필름 그레인)
// Pass 5: 언샤프 마스크 샤프닝
Shader "Hidden/SniperRidge/Post"
{
    Properties
    {
        _MainTex ("Texture", 2D) = "white" {}
    }
    SubShader
    {
        Cull Off ZWrite Off ZTest Always

        // Pass 0: 밝은 부분 추출 (다운샘플 대상)
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float _Threshold;
            half4 frag(v2f_img i) : SV_Target
            {
                half4 c = tex2D(_MainTex, i.uv);
                float l = max(c.r, max(c.g, c.b));
                float k = max(0.0, l - _Threshold);
                return c * (k / max(l, 1e-4));
            }
            ENDCG
        }

        // Pass 1: 가우시안 블러 (방향은 _BlurDir)
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float4 _BlurDir;
            half4 frag(v2f_img i) : SV_Target
            {
                float w0 = 0.227, w1 = 0.194, w2 = 0.121, w3 = 0.054, w4 = 0.016;
                half4 s = tex2D(_MainTex, i.uv) * w0;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 1.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 1.0)) * w1;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 2.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 2.0)) * w2;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 3.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 3.0)) * w3;
                s += (tex2D(_MainTex, i.uv + _BlurDir.xy * 4.0) + tex2D(_MainTex, i.uv - _BlurDir.xy * 4.0)) * w4;
                return s;
            }
            ENDCG
        }

        // Pass 2: SSAO. 뷰 공간 반구 샘플링, 픽셀마다 회전한 커널, 거리 제한.
        // _AoParams = (반경 m, 바이어스 m, 강도(파워), 최대 거리 m)
        // _AoProj   = (tan(fovX/2), tan(fovY/2), 0, 0)
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            sampler2D _CameraDepthNormalsTexture;
            float4 _AoParams;
            float4 _AoProj;

            // 반구 커널 (z >= 0), 중심에 가까울수록 촘촘하게
            static const float3 kernel[12] = {
                float3( 0.19, -0.13,  0.21), float3(-0.10,  0.31,  0.18), float3( 0.33,  0.22,  0.09),
                float3(-0.36, -0.12,  0.24), float3( 0.06,  0.05,  0.51), float3(-0.22,  0.45,  0.30),
                float3( 0.52, -0.31,  0.24), float3(-0.55, -0.35,  0.33), float3( 0.15,  0.61,  0.47),
                float3( 0.62,  0.42,  0.42), float3(-0.30, -0.70,  0.55), float3( 0.71, -0.09,  0.62)
            };

            float3 ViewPos(float2 uv, float depth)
            {
                float2 ndc = uv * 2.0 - 1.0;
                return float3(ndc * _AoProj.xy * depth, -depth);
            }

            float2 ProjectUv(float3 p)
            {
                float2 ndc = p.xy / (max(-p.z, 1e-3) * _AoProj.xy);
                return ndc * 0.5 + 0.5;
            }

            float Noise(float2 px)
            {
                // Interleaved gradient noise (Jimenez 2014)
                return frac(52.9829189 * frac(dot(px, float2(0.06711056, 0.00583715))));
            }

            half4 frag(v2f_img i) : SV_Target
            {
                float4 dn = tex2D(_CameraDepthNormalsTexture, i.uv);
                float depth01 = DecodeFloatRG(dn.zw);
                float depth = depth01 * _ProjectionParams.z;
                if (depth01 > 0.999) return half4(1, 1, 1, 1);   // 하늘
                float3 n = DecodeViewNormalStereo(dn);
                float3 p = ViewPos(i.uv, depth);

                float radius = _AoParams.x;
                float bias = _AoParams.y;
                float fade = saturate(1.0 - depth / _AoParams.w);
                if (fade <= 0.0) return half4(1, 1, 1, 1);

                float ang = Noise(i.uv * _ScreenParams.xy) * 6.2831853;
                float3 rvec = float3(cos(ang), sin(ang), 0.0);
                float3 t = normalize(rvec - n * dot(rvec, n));
                float3 b = cross(n, t);
                float3x3 tbn = float3x3(t, b, n);

                float occlusion = 0.0;
                [unroll]
                for (int k = 0; k < 12; k++)
                {
                    float3 s = p + mul(kernel[k], tbn) * radius;
                    float2 suv = ProjectUv(s);
                    if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
                    float sd = DecodeFloatRG(tex2D(_CameraDepthNormalsTexture, suv).zw) * _ProjectionParams.z;
                    float sampleDepth = -s.z;
                    float rangeCheck = smoothstep(0.0, 1.0, radius / max(abs(depth - sd), 1e-3));
                    occlusion += (sd < sampleDepth - bias ? 1.0 : 0.0) * rangeCheck;
                }
                float ao = 1.0 - occlusion / 12.0;
                ao = pow(saturate(ao), _AoParams.z);
                float result = lerp(1.0, ao, fade);
                return half4(result, result, result, 1);
            }
            ENDCG
        }

        // Pass 3: 깊이 인식 AO 블러 (방향은 _BlurDir). 물체 경계는 섞지 않는다.
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            sampler2D _CameraDepthNormalsTexture;
            float4 _BlurDir;
            static const float weights[4] = { 0.9, 0.7, 0.45, 0.2 };
            half4 frag(v2f_img i) : SV_Target
            {
                float d0 = DecodeFloatRG(tex2D(_CameraDepthNormalsTexture, i.uv).zw);
                float sum = tex2D(_MainTex, i.uv).r;
                float wsum = 1.0;
                [unroll]
                for (int k = 1; k <= 4; k++)
                {
                    float2 o = _BlurDir.xy * k;
                    float2 uvA = i.uv + o, uvB = i.uv - o;
                    float dA = DecodeFloatRG(tex2D(_CameraDepthNormalsTexture, uvA).zw);
                    float dB = DecodeFloatRG(tex2D(_CameraDepthNormalsTexture, uvB).zw);
                    float wA = weights[k - 1] * saturate(1.0 - abs(dA - d0) * 400.0);
                    float wB = weights[k - 1] * saturate(1.0 - abs(dB - d0) * 400.0);
                    sum += tex2D(_MainTex, uvA).r * wA + tex2D(_MainTex, uvB).r * wB;
                    wsum += wA + wB;
                }
                float result = sum / wsum;
                return half4(result, result, result, 1);
            }
            ENDCG
        }

        // Pass 4: 합성 + 색보정
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            sampler2D _Bloom;
            sampler2D _AO;
            float _Exposure, _BloomIntensity, _Saturation, _Contrast, _Vignette, _AoIntensity, _Grain, _SplitStrength, _SplitBalance;
            float4 _WhiteBalance, _Lift, _Gamma, _Gain, _SplitShadows, _SplitHighlights;

            float3 aces(float3 x)
            {
                const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
                return saturate((x * (a * x + b)) / (x * (c * x + d) + e));
            }

            float Noise(float2 px)
            {
                return frac(52.9829189 * frac(dot(px, float2(0.06711056, 0.00583715))));
            }

            half4 frag(v2f_img i) : SV_Target
            {
                float3 c = tex2D(_MainTex, i.uv).rgb;
                c += tex2D(_Bloom, i.uv).rgb * _BloomIntensity;

                // 앰비언트 오클루전: 구석과 접지면을 어둡게
                float ao = tex2D(_AO, i.uv).r;
                c *= lerp(1.0, ao, _AoIntensity);

                // 노출 + 화이트 밸런스 (선형 HDR 공간)
                c *= _Exposure * _WhiteBalance.rgb;

                // 톤매핑
                c = aces(c);

                // 리프트 / 감마 / 게인 (LDR)
                c = saturate(c * _Gain.rgb + _Lift.rgb);
                c = pow(c, _Gamma.rgb);

                // 스플릿 토닝: 어두운 곳은 차갑게, 밝은 곳은 따뜻하게
                float lum = dot(c, float3(0.2126, 0.7152, 0.0722));
                float3 tone = lerp(_SplitShadows.rgb, _SplitHighlights.rgb, smoothstep(0.0, 1.0, lum + _SplitBalance));
                c *= 1.0 + (tone - 0.5) * 2.0 * _SplitStrength;

                // 채도 / 대비
                lum = dot(c, float3(0.2126, 0.7152, 0.0722));
                c = lerp(lum.xxx, c, _Saturation);
                c = (c - 0.5) * _Contrast + 0.5;

                // 비네트
                float2 d = i.uv - 0.5;
                c *= 1.0 - _Vignette * dot(d, d) * 2.5;

                // 필름 그레인: 어두운 영역에 조금 더
                float g = Noise(i.uv * _ScreenParams.xy + frac(_Time.y * 7.31) * 1000.0) - 0.5;
                c += g * _Grain * (1.0 - saturate(lum));

                return half4(saturate(c), 1.0);
            }
            ENDCG
        }

        // Pass 5: 언샤프 마스크 샤프닝 (LDR)
        Pass
        {
            CGPROGRAM
            #pragma vertex vert_img
            #pragma fragment frag
            #include "UnityCG.cginc"
            sampler2D _MainTex;
            float4 _MainTex_TexelSize;
            float _Sharpen;
            half4 frag(v2f_img i) : SV_Target
            {
                float3 c = tex2D(_MainTex, i.uv).rgb;
                float2 px = _MainTex_TexelSize.xy;
                float3 n = tex2D(_MainTex, i.uv + float2(0, px.y)).rgb
                         + tex2D(_MainTex, i.uv - float2(0, px.y)).rgb
                         + tex2D(_MainTex, i.uv + float2(px.x, 0)).rgb
                         + tex2D(_MainTex, i.uv - float2(px.x, 0)).rgb;
                float3 sharp = c + (c - n * 0.25) * _Sharpen;
                return half4(saturate(sharp), 1.0);
            }
            ENDCG
        }
    }
    Fallback Off
}
