FROM eclipse-temurin:21-jdk
RUN useradd -u 10001 -M runner
COPY support /opt/vizdsa/support-src
COPY Tracer.java /opt/vizdsa/tracer-src/Tracer.java
RUN javac -g -d /opt/vizdsa/support /opt/vizdsa/support-src/*.java \
 && javac -d /opt/vizdsa/tracer /opt/vizdsa/tracer-src/Tracer.java \
 && jar cf /opt/vizdsa/tracer.jar -C /opt/vizdsa/tracer . \
 && java -XX:ArchiveClassesAtExit=/opt/vizdsa/tracer.jsa -cp /opt/vizdsa/tracer.jar Tracer --warmup \
 && chmod -R a+rX /opt/vizdsa
USER runner
ENTRYPOINT ["java", "-XX:SharedArchiveFile=/opt/vizdsa/tracer.jsa", "-XX:TieredStopAtLevel=1", "-Xshare:auto", "-Xmx200m", "-cp", "/opt/vizdsa/tracer.jar", "Tracer"]
