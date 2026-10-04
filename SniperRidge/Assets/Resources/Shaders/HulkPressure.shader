Shader "SniperRidge/HulkPressure"
{
    Properties { _Strength("Refraction", Range(0,1)) = 0.5 }
    SubShader
    {
        Tags { "Queue"="Transparent-20" "RenderType"="Transparent" "IgnoreProjector"="True" }
        // A named grab is shared by overlapping waves in the built-in renderer.
        GrabPass { "_HulkPressureScene" }
        Pass
        {
            Cull Off ZWrite Off Blend SrcAlpha OneMinusSrcAlpha
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma target 3.0
            #include "UnityCG.cginc"
            sampler2D _HulkPressureScene;
            float _Strength;
            struct appdata { float4 vertex:POSITION; float3 normal:NORMAL; float2 uv:TEXCOORD0; fixed4 color:COLOR; };
            struct v2f { float4 pos:SV_POSITION; float4 screen:TEXCOORD0; float2 uv:TEXCOORD1; float2 flow:TEXCOORD2; fixed4 color:COLOR; };
            v2f vert(appdata v)
            {
                v2f o; o.pos=UnityObjectToClipPos(v.vertex);o.screen=ComputeGrabScreenPos(o.pos);o.uv=v.uv;o.color=v.color;
                float2 projected=mul(UNITY_MATRIX_VP,float4(v.normal,0)).xy;
                o.flow=projected/max(length(projected),.01);return o;
            }
            fixed4 frag(v2f i):SV_Target
            {
                float edge=pow(saturate(sin(i.uv.y*3.14159265)),1.7);
                float turbulence=.7+.16*sin(i.uv.x*113+_Time.y*17)+.14*sin(i.uv.x*227-i.uv.y*8-_Time.y*21);
                float amount=edge*i.color.a*turbulence;
                float2 uv=i.screen.xy/i.screen.w;
                float2 offset=i.flow*amount*_Strength*.008;
                fixed3 scene=tex2D(_HulkPressureScene,uv+offset).rgb;
                // Mostly displaced scenery, with only a brief pale condensation edge.
                fixed3 mist=lerp(scene,i.color.rgb,.13*edge);
                return fixed4(mist,saturate(amount*.75));
            }
            ENDCG
        }
    }
    Fallback Off
}
