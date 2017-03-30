package io.typefox.sprotty.example.multicore.web

import io.typefox.sprotty.api.ActionMessage
import io.typefox.sprotty.example.multicore.web.diagram.MulticoreAllocationDiagramServer
import io.typefox.sprotty.server.websocket.DiagramServerEndpoint
import java.net.InetSocketAddress
import javax.websocket.EndpointConfig
import javax.websocket.Session
import javax.websocket.server.ServerEndpointConfig
import org.apache.log4j.Logger
import org.eclipse.jetty.annotations.AnnotationConfiguration
import org.eclipse.jetty.server.Server
import org.eclipse.jetty.servlet.ServletContextHandler
import org.eclipse.jetty.util.log.Slf4jLog
import org.eclipse.jetty.webapp.MetaInfConfiguration
import org.eclipse.jetty.webapp.WebAppContext
import org.eclipse.jetty.webapp.WebInfConfiguration
import org.eclipse.jetty.webapp.WebXmlConfiguration
import org.eclipse.jetty.websocket.jsr356.server.deploy.WebSocketServerContainerInitializer
import org.eclipse.xtext.util.DisposableRegistry
import javax.websocket.CloseReason

/**
 * This program starts an HTTP server for testing the web integration of your DSL.
 * Just execute it and point a web browser to http://localhost:8080/
 */
class MulticoreServerLauncher {
	
	static val LOG = Logger.getLogger(MulticoreServerLauncher)
	
	static class TestServerEndpoint extends DiagramServerEndpoint {
    	override onOpen(Session session, EndpointConfig config) {
    		LOG.info('''Opened connection [«session.id»]''')
    		session.maxIdleTimeout = 0
    		super.onOpen(session, config)
    	}
    	
		override onClose(Session session, CloseReason closeReason) {
			LOG.info('''Closed connection [«session.id»]''')
			super.onClose(session, closeReason)
		}
    	
		override accept(ActionMessage message) {
			LOG.info('''SERVER: «message»''')
			super.accept(message)
		}
		
		override protected fireMessageReceived(ActionMessage message) {
			LOG.info('''CLIENT: «message»''')
			super.fireMessageReceived(message)
		}
	}
	
	def static void main(String[] args) {
		val injector = new MulticoreAllocationWebSetup().createInjectorAndDoEMFRegistration()
		val disposableRegistry = injector.getInstance(DisposableRegistry)
		val diagramServer = injector.getInstance(MulticoreAllocationDiagramServer)
		
		val server = new Server(new InetSocketAddress('localhost', 8080))
		server.handler = new WebAppContext => [
			resourceBase = 'src/main/webapp'
			welcomeFiles = #['index.html']
			contextPath = '/'
			configurations = #[
				new AnnotationConfiguration,
				new WebXmlConfiguration,
				new WebInfConfiguration,
				new MetaInfConfiguration
			]
			setAttribute(WebInfConfiguration.CONTAINER_JAR_PATTERN, '.*/io\\.typefox\\.sprotty\\.example\\.multicore\\.web/.*,.*\\.jar')
			setInitParameter('org.mortbay.jetty.servlet.Default.useFileMappedBuffer', 'false')
		]
		
		val container = WebSocketServerContainerInitializer.configureContext(server.handler as ServletContextHandler)
		val endpointConfigBuilder = ServerEndpointConfig.Builder.create(TestServerEndpoint, '/diagram')
		endpointConfigBuilder.configurator(new ServerEndpointConfig.Configurator {
			override <T> getEndpointInstance(Class<T> endpointClass) throws InstantiationException {
				super.getEndpointInstance(endpointClass) => [ instance |
					val endpoint = instance as DiagramServerEndpoint
					diagramServer.remoteEndpoint = endpoint
					endpoint.addActionListener(diagramServer)
					endpoint.addErrorListener[e | LOG.warn(e)]
				]
			}
		})
		container.addEndpoint(endpointConfigBuilder.build())
		
		val log = new Slf4jLog(MulticoreServerLauncher.name)
		try {
			server.start
			log.info('Server started ' + server.getURI + '...')
			new Thread[
				log.info('Press enter to stop the server...')
				val key = System.in.read
				if (key != -1) {
					server.stop
				} else {
					log.warn('Console input is not available. In order to stop the server, you need to cancel process manually.')
				}
			].start
			server.join
		} catch (Exception exception) {
			log.warn(exception.message)
			System.exit(1)
		} finally {
			disposableRegistry.dispose()
		}
	}
}
