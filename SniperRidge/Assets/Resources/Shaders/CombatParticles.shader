// 전투 효과용 파티클 셰이더 (내장 렌더 파이프라인).
// 하나의 셰이더로 연기(알파 블렌드)와 화염/섬광/불티(가산 블렌드)를 모두 그린다.
// - 블렌드 모드는 재질 프로퍼티(_SrcBlend/_DstBlend)로 정한다.
// - 소프트 파티클: 카메라 깊이 텍스처가 있으면 지면·벽과 만나는 부분이 부드럽게 사라진다.
// - _TopLight: 연기 스프라이트의 위쪽을 밝게, 아래쪽을 어둡게 해 햇빛을 받은 것처럼 보이게 한다.
// - _FogAdditive: 가산 블렌드 파티클은 안개 색이 아니라 검정으로 사라져 멀리서 허옇게 뜨지 않는다.
Shader "SniperRidge/CombatParticles"
{
    Properties
    {
        _MainTex ("Particle", 2D) = "white" {}
        _SrcBlend ("Src blend", Float) = 5      // SrcAlpha
        _DstBlend ("Dst blend", Float) = 10     // OneMinusSrcAlpha
        _InvFade ("Soft particle factor", Range(0.01, 3.0)) = 1.0
        _TopLight ("Top light", Range(0, 1)) = 0
        _FogAdditive ("Fog to black", Range(0, 1)) = 0
    }
    SubShader
    {
        Tags { "Queue"="Transparent" "RenderType"="Transparent" "IgnoreProjector"="True" "PreviewType"="Plane" }
        Blend [_SrcBlend] [_DstBlend]
        ZWrite Off
        Cull Off
        Lighting Off

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #pragma multi_compile_particles
            #pragma multi_compile_fog
            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float _InvFade, _TopLight, _FogAdditive;

            struct appdata
            {
                float4 vertex : POSITION;
                fixed4 color : COLOR;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                fixed4 color : COLOR;
                float2 uv : TEXCOORD0;
                UNITY_FOG_COORDS(1)
                #ifdef SOFTPARTICLES_ON
                float4 projPos : TEXCOORD2;
                #endif
            };

            #ifdef SOFTPARTICLES_ON
            UNITY_DECLARE_DEPTH_TEXTURE(_CameraDepthTexture);
            #endif

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                #ifdef SOFTPARTICLES_ON
                o.projPos = ComputeScreenPos(o.pos);
                COMPUTE_EYEDEPTH(o.projPos.z);
                #endif
                o.color = v.color;
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                UNITY_TRANSFER_FOG(o, o.pos);
                return o;
            }

            fixed4 frag(v2f i) : SV_Target
            {
                fixed4 col = tex2D(_MainTex, i.uv) * i.color;
                #ifdef SOFTPARTICLES_ON
                float sceneZ = LinearEyeDepth(SAMPLE_DEPTH_TEXTURE_PROJ(_CameraDepthTexture, UNITY_PROJ_COORD(i.projPos)));
                float partZ = i.projPos.z;
                col.a *= saturate(_InvFade * (sceneZ - partZ));
                #endif
                // 위쪽이 밝은 연기: 스프라이트 uv.y 를 기준으로 음영을 넣는다.
                col.rgb *= lerp(1.0, lerp(0.55, 1.15, i.uv.y), _TopLight);

                fixed4 fogged = col;
                UNITY_APPLY_FOG(i.fogCoord, fogged);
                fixed4 foggedBlack = col;
                UNITY_APPLY_FOG_COLOR(i.fogCoord, foggedBlack, fixed4(0, 0, 0, 0));
                return lerp(fogged, foggedBlack, _FogAdditive);
            }
            ENDCG
        }
    }
    Fallback "SniperRidge/RocketParticles"
}
