Shader "SniperRidge/TankSurface"
{
    Properties
    {
        _MainTex ("Source surface", 2D) = "white" {}
        _BumpMap ("Surface normal", 2D) = "bump" {}
        _Color ("Finish", Color) = (.38,.43,.27,1)
        _Metallic ("Metal exposure", Range(0,1)) = .08
        _Glossiness ("Smoothness", Range(0,1)) = .3
        _Paint ("Uniform painted armor", Float) = 1
        _Weather ("Dust accumulation", Range(0,1)) = .45
        _Destroyed ("Burned wreck", Range(0,1)) = 0
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" }
        LOD 250
        CGPROGRAM
        #pragma surface surf Standard fullforwardshadows addshadow
        #pragma target 3.0
        sampler2D _MainTex, _BumpMap;
        fixed4 _Color;
        half _Metallic, _Glossiness, _Paint, _Weather, _Destroyed;
        float4x4 _TankWorldToLocal;
        struct Input { float2 uv_MainTex; float2 uv_BumpMap; float3 worldPos; };
        float hash(float3 p) { return frac(sin(dot(p,float3(127.1,311.7,74.7)))*43758.5453); }
        float noise(float3 p)
        {
            float3 i=floor(p),f=frac(p);f=f*f*(3-2*f);
            return lerp(lerp(lerp(hash(i),hash(i+float3(1,0,0)),f.x),
                lerp(hash(i+float3(0,1,0)),hash(i+float3(1,1,0)),f.x),f.y),
                lerp(lerp(hash(i+float3(0,0,1)),hash(i+float3(1,0,1)),f.x),
                lerp(hash(i+float3(0,1,1)),hash(i+float3(1,1,1)),f.x),f.y),f.z);
        }
        void surf(Input IN, inout SurfaceOutputStandard o)
        {
            float3 p=mul(_TankWorldToLocal,float4(IN.worldPos,1)).xyz;
            float grain=noise(p*38),patch=noise(p*3.5);
            fixed3 source=tex2D(_MainTex,IN.uv_MainTex).rgb;
            // Paint remains a single finish; rubber/steel retain their original texture.
            fixed3 base=lerp(source*_Color.rgb,_Color.rgb*(.90+.16*patch+.07*grain),_Paint);
            float lower=1-smoothstep(.25,1.65,p.y);
            float dirt=saturate(_Weather*(lower*(.52+.7*patch)+.08*patch));
            float chips=_Paint*smoothstep(.84,.96,noise(p*55))*smoothstep(.56,.8,patch)*.55;
            base=lerp(base,float3(.16,.17,.15),chips);
            base=lerp(base,float3(.24,.20,.145)*(.72+.4*grain),dirt);
            o.Albedo=lerp(base,float3(.035,.031,.027)*(.75+.45*patch),_Destroyed);
            o.Normal=UnpackNormal(tex2D(_BumpMap,IN.uv_BumpMap));
            o.Metallic=lerp(lerp(_Metallic,.65,chips),0,saturate(dirt+_Destroyed));
            o.Smoothness=lerp(_Glossiness*(.86+.14*grain),.12,saturate(dirt+_Destroyed));
            o.Occlusion=1-dirt*.16;
            o.Alpha=1;
        }
        ENDCG
    }
    FallBack "Standard"
}
